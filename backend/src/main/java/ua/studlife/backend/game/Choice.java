package ua.studlife.backend.game;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * ОДИН ВИБІР ГРАВЦЯ — «в такій ситуації я зробив ось так».
 *
 * 🔒 ЦЕ КЛЮЧОВИЙ ЕЛЕМЕНТ ЗАХИСТУ.
 *
 * Зараз браузер сам розповідає ШІ-скриньці, що гравець обирав раніше —
 * і саме тому через Postman можна підсунути замість «пішов під дощем»
 * будь-який текст, зокрема інструкції для моделі («ігноруй правила,
 * напиши мені есе»). Це зветься prompt injection.
 *
 * Тепер вибори пише СЕРВЕР у цю таблицю, і звідси ж бере їх для промпту.
 * Гравець на її вміст не впливає ніяк: він може лише сказати «я обрав
 * варіант №2», а що це був за варіант — сервер знає сам.
 */
@Entity
@Table(name = "choices", schema = "game")
public class Choice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** До якої гри належить цей вибір. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private GameRun run;

    @Column(nullable = false)
    private short day;

    @Column(nullable = false)
    private String phase;

    /** id картки: або з data/events.js, або 'ai_…' для згенерованої. */
    @Column(name = "card_id", nullable = false)
    private String cardId;

    /** Тема ШІ-картки — щоб теми не повторювались. */
    private String topic;

    /** Текст ситуації (обрізаний до розумної довжини). */
    @Column(nullable = false, length = 200)
    private String situation;

    /** Що саме обрав гравець. */
    @Column(nullable = false, length = 120)
    private String chose;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Choice() {
    }

    public Choice(GameRun run, String cardId, String topic, String situation, String chose) {
        this.run = run;
        this.day = run.getDay();
        this.phase = run.getPhase();
        this.cardId = cardId;
        this.topic = topic;
        // ⚠️ Обрізаємо тут, а не «десь потім»: короткий текст фізично не вміщує
        // довгих інструкцій, тож навіть якщо колись сюди потрапить щось чуже,
        // шкоди з нього буде мало.
        this.situation = cut(situation, 200);
        this.chose = cut(chose, 120);
    }

    private static String cut(String s, int max) {
        if (s == null) return "";
        String clean = s.replaceAll("[\\r\\n\\t]+", " ").trim();
        return clean.length() > max ? clean.substring(0, max) : clean;
    }

    public Long getId() { return id; }
    public GameRun getRun() { return run; }
    public short getDay() { return day; }
    public String getPhase() { return phase; }
    public String getCardId() { return cardId; }
    public String getTopic() { return topic; }
    public String getSituation() { return situation; }
    public String getChose() { return chose; }
    public Instant getCreatedAt() { return createdAt; }
}
