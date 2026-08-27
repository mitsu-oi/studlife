package ua.studlife.backend.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import ua.studlife.backend.game.Choice;
import ua.studlife.backend.game.ChoiceRepository;
import ua.studlife.backend.game.GameRun;
import ua.studlife.backend.game.GameService;
import ua.studlife.backend.user.User;
import ua.studlife.backend.user.UserService;

import java.time.LocalDate;
import java.util.Map;

/**
 * ВІКОНЦЕ ДЛЯ ШІ-КАРТОК.
 *
 * Порівняй із тим, що є зараз на Cloudflare:
 *   БУЛО:  будь-хто з адресою → сервер вірить усьому, що прислали
 *   СТАЛО: тільки той, хто увійшов → сервер бере дані зі своєї бази
 */
@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiCardService ai;
    private final GameService games;
    private final UserService users;
    private final ChoiceRepository choices;
    private final AiUsageRepository usageRepo;

    public AiController(AiCardService ai, GameService games, UserService users,
                        ChoiceRepository choices, AiUsageRepository usageRepo) {
        this.ai = ai;
        this.games = games;
        this.users = users;
        this.choices = choices;
        this.usageRepo = usageRepo;
    }

    /**
     * ДАЙ КАРТКУ.
     *
     * Зверни увагу, ЩО НЕ ПРИЙМАЄТЬСЯ від гри: ні стан, ні історія виборів,
     * ні модель, ні «думання». Усе це сервер знає сам. Гра лише каже
     * «мені потрібна картка», і все.
     */
    @PostMapping("/card")
    public Map<String, Object> card(Authentication auth) {
        User user = currentUser(auth);
        GameRun run = games.findActive(user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Немає активної гри"));

        return ai.generate(user, run, isWeekend(run.getDay()));
    }

    /**
     * ЗАПАМ'ЯТАТИ ВИБІР — гра повідомляє, що гравець обрав.
     *
     * ⚠️ Тексти обрізаються при збереженні (див. Choice), тому навіть якщо
     * хтось надішле сюди довгу «інструкцію для моделі», у базу потрапить
     * короткий уривок, з якого моделі нічого не накажеш.
     */
    @PostMapping("/choice")
    public ResponseEntity<Void> remember(@Valid @RequestBody ChoiceRequest req, Authentication auth) {
        User user = currentUser(auth);
        GameRun run = games.findActive(user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Немає активної гри"));

        choices.save(new Choice(run, req.cardId(), req.topic(), req.situation(), req.chose()));
        return ResponseEntity.noContent().build();
    }

    /** СКІЛЬКИ ЛИШИЛОСЬ — щоб гра могла показати стан у чит-панелі. */
    @GetMapping("/status")
    public Map<String, Object> status(Authentication auth) {
        User user = currentUser(auth);
        int used = usageRepo.findByUserAndUsageDay(user, LocalDate.now())
                .map(AiUsage::getUsed).orElse(0);
        return Map.of("enabled", ai.isEnabled(), "usedToday", used);
    }

    /** Бланк для запам'ятовування вибору. */
    public record ChoiceRequest(
            @NotBlank @Size(max = 60) String cardId,
            @Size(max = 30) String topic,
            @NotBlank @Size(max = 300) String situation,
            @NotBlank @Size(max = 200) String chose
    ) {}

    /** день 1 = понеділок; 6 і 7 — вихідні (як у js/state.js) */
    private boolean isWeekend(int day) {
        int weekday = ((day - 1) % 7) + 1;
        return weekday == 6 || weekday == 7;
    }

    private User currentUser(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Спершу увійди");
        }
        return users.findByUsername(auth.getName())
                .filter(u -> !u.isBlocked())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Сесія недійсна"));
    }
}
