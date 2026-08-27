package ua.studlife.backend.ai;

// ⚠️ У Spring Boot 4 бібліотека Jackson (читання/запис JSON) переїхала:
// раніше була com.fasterxml.jackson, тепер tools.jackson. Тому приклади
// з інтернету, написані до 2026 року, тут не скомпілюються.
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import ua.studlife.backend.game.Choice;
import ua.studlife.backend.game.ChoiceRepository;
import ua.studlife.backend.game.GameRun;
import ua.studlife.backend.user.User;

import org.springframework.data.domain.Limit;

import java.time.LocalDate;
import java.util.*;

/**
 * ГЕНЕРАЦІЯ ШІ-КАРТОК — тепер на нашому сервері.
 *
 * 🔒 ЩО САМЕ ТУТ ЗАКРИВАЄТЬСЯ (порівняно зі скринькою на Cloudflare):
 *
 *  1. Звертатись може ТІЛЬКИ той, хто увійшов — інакше сюди не дійде запит.
 *  2. Історія виборів береться З БАЗИ, а не від браузера → підсунути свої
 *     інструкції моделі (prompt injection) більше нізвідки.
 *  3. Ліміт рахується НА ЛЮДИНУ → один зловмисник не з'їдає ліміт усіх.
 *  4. Модель і «думання» задає сервер → їх не можна вибрати ззовні.
 *  5. Загальний денний стоп-кран — щоб ліміт Gemini не вигорів за раз.
 */
@Service
public class AiCardService {

    // ---------- налаштування (з application.properties) ----------
    @Value("${ai.gemini.key:}")
    private String apiKey;

    @Value("${ai.gemini.models:gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite}")
    private String modelChain;

    @Value("${ai.limit.per-user-per-day:40}")
    private int perUserLimit;

    @Value("${ai.limit.total-per-day:800}")
    private int totalLimit;

    /** Як часто картка буде продовженням попереднього вибору. */
    @Value("${ai.followup-chance:0.35}")
    private double followUpChance;

    private static final String GEMINI_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";

    private final AiUsageRepository usageRepo;
    private final ChoiceRepository choices;
    private final ObjectMapper json = new ObjectMapper();
    private final RestClient http = RestClient.create();
    private final Random random = new Random();

    public AiCardService(AiUsageRepository usageRepo, ChoiceRepository choices) {
        this.usageRepo = usageRepo;
        this.choices = choices;
    }

    /** Чи взагалі налаштований ключ — щоб гра знала, чи просити картки. */
    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * ЗГЕНЕРУВАТИ КАРТКУ для конкретної гри конкретного гравця.
     */
    @Transactional
    public Map<String, Object> generate(User user, GameRun run, boolean isWeekend) {
        if (!isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "ШІ не налаштований на сервері");
        }

        checkLimits(user);

        // ---------- усе для промпту беремо З БАЗИ ----------
        List<Choice> recent = choices.findByRunOrderByCreatedAtDesc(run, Limit.of(5));

        List<String> recentTopics = choices
                .findByRunAndTopicIsNotNullOrderByCreatedAtDesc(run, Limit.of(5))
                .stream().map(Choice::getTopic).filter(Objects::nonNull).toList();

        String place = AiPrompt.placeOf(run, isWeekend);
        AiPrompt.Topic topic = AiPrompt.pickTopic(place, recentTopics, random);
        boolean followUp = !recent.isEmpty() && random.nextDouble() < followUpChance;

        String prompt = AiPrompt.build(run, isWeekend, recent, topic, place, followUp);

        // ---------- питаємо модель ----------
        JsonNode card = askModelChain(prompt);

        countUsage(user);

        return sanitize(card, followUp ? null : topic.key());
    }

    /**
     * ЛІМІТИ — два рівні.
     * Особистий захищає спільний ресурс від одного зловмисника,
     * загальний — від ситуації «всі разом вигоріли за годину».
     */
    private void checkLimits(User user) {
        LocalDate today = LocalDate.now();

        int mine = usageRepo.findByUserAndUsageDay(user, today)
                .map(AiUsage::getUsed).orElse(0);
        if (mine >= perUserLimit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "На сьогодні ліміт ШІ-карток вичерпано — гра продовжиться на звичайних");
        }

        if (usageRepo.totalUsedOn(today) >= totalLimit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Спільний денний ліміт вичерпано — завтра буде знову");
        }
    }

    private void countUsage(User user) {
        LocalDate today = LocalDate.now();
        AiUsage usage = usageRepo.findByUserAndUsageDay(user, today)
                .orElseGet(() -> new AiUsage(user));
        usage.increment();
        usageRepo.save(usage);
    }

    /**
     * Пробуємо моделі по черзі: у найновішої найменший безкоштовний ліміт,
     * тож коли вона закінчиться — беремо простішу, і гра грає далі.
     */
    private JsonNode askModelChain(String prompt) {
        RuntimeException last = null;
        for (String model : modelChain.split(",")) {
            try {
                return askModel(model.trim(), prompt);
            } catch (RuntimeException e) {
                last = e;
            }
        }
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "ШІ зараз недоступний" + (last != null ? ": " + last.getMessage() : ""));
    }

    private JsonNode askModel(String model, String prompt) {
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json",
                        "responseSchema", cardSchema(),
                        "temperature", 1.1,
                        "maxOutputTokens", 3000,
                        // «трохи подумати» — компроміс: текст без одруківок і швидко
                        "thinkingConfig", Map.of("thinkingBudget", 512)
                )
        );

        String response = http.post()
                .uri(String.format(GEMINI_URL, model))
                .header("x-goog-api-key", apiKey)
                .header("Content-Type", "application/json")
                .body(body)
                .retrieve()
                .body(String.class);

        try {
            JsonNode root = json.readTree(response);
            String text = root.path("candidates").path(0)
                    .path("content").path("parts").path(0).path("text").asText(null);
            if (text == null || text.isBlank()) {
                throw new IllegalStateException("порожня відповідь");
            }
            return json.readTree(text);
        } catch (Exception e) {
            throw new IllegalStateException("не вдалося прочитати відповідь: " + e.getMessage());
        }
    }

    /** «Бланк» картки — модель зобов'язана відповісти строго за ним. */
    private Map<String, Object> cardSchema() {
        Map<String, Object> effects = Map.of(
                "type", "object",
                "properties", Map.of(
                        "money", Map.of("type", "integer"),
                        "energy", Map.of("type", "integer"),
                        "mental", Map.of("type", "integer"),
                        "social", Map.of("type", "integer"),
                        "study", Map.of("type", "integer")
                )
        );
        Map<String, Object> choice = Map.of(
                "type", "object",
                "properties", Map.of(
                        "label", Map.of("type", "string"),
                        "result", Map.of("type", "string"),
                        "effects", effects
                ),
                "required", List.of("label", "result", "effects")
        );
        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "text", Map.of("type", "string"),
                        "choices", Map.of("type", "array", "minItems", 2, "maxItems", 3, "items", choice)
                ),
                "required", List.of("text", "choices")
        );
    }

    // ---------- межі, у які втискаємо числа від ШІ ----------
    private static final int MAX_STAT = 20;
    private static final int MAX_MONEY = 600;

    /**
     * Чистка відповіді: моделі не віримо на слово так само, як і клієнту.
     * Обрізаємо тексти й затискаємо числа в межі балансу.
     */
    private Map<String, Object> sanitize(JsonNode card, String topicKey) {
        String text = card.path("text").asText("");
        JsonNode rawChoices = card.path("choices");

        if (text.isBlank() || !rawChoices.isArray() || rawChoices.size() < 2) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "ШІ повернув картку неправильної форми");
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode c : rawChoices) {
            Map<String, Object> effects = new LinkedHashMap<>();
            JsonNode e = c.path("effects");
            for (String stat : List.of("energy", "mental", "social", "study")) {
                int v = clamp(e.path(stat).asInt(0), MAX_STAT);
                if (v != 0) effects.put(stat, v);
            }
            int money = clamp(e.path("money").asInt(0), MAX_MONEY);
            if (money != 0) effects.put("money", money);

            out.add(Map.of(
                    "label", cut(c.path("label").asText("Хай буде"), 60),
                    "result", cut(c.path("result").asText("Сталося як сталося."), 300),
                    "effects", effects
            ));
            if (out.size() == 3) break;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", "ai_" + System.currentTimeMillis());
        result.put("ai", true);
        if (topicKey != null) result.put("topic", topicKey);
        result.put("text", cut(text, 400));
        result.put("choices", out);
        return result;
    }

    private static int clamp(int v, int limit) {
        return Math.max(-limit, Math.min(limit, v));
    }

    private static String cut(String s, int max) {
        String clean = s.replaceAll("[\\r\\n\\t]+", " ").trim();
        return clean.length() > max ? clean.substring(0, max) : clean;
    }
}
