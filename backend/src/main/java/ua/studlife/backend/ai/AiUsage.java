package ua.studlife.backend.ai;

import jakarta.persistence.*;
import ua.studlife.backend.user.User;

import java.time.LocalDate;

/**
 * СКІЛЬКИ РАЗІВ ГРАВЕЦЬ ЗВЕРТАВСЯ ДО ШІ СЬОГОДНІ.
 *
 * 🔒 Друга частина захисту.
 *
 * Зараз ліміт Gemini спільний: один зловмисник із Postman за годину
 * з'їдає денну норму — і картки зникають у ВСІХ гравців.
 *
 * Тепер лічильник свій у кожного. Хтось зловживає — вигорає тільки
 * його власний ліміт, решта грає далі. А ще одразу видно, хто саме
 * поводиться дивно.
 */
@Entity
@Table(name = "ai_usage", schema = "game")
public class AiUsage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * За яку добу рахуємо. Разом із user_id це унікальна пара
     * (правило стоїть у міграції V2) — тобто на кожного гравця
     * на кожен день може бути лише один рядок.
     */
    @Column(name = "usage_day", nullable = false)
    private LocalDate usageDay = LocalDate.now();

    @Column(nullable = false)
    private int used = 0;

    protected AiUsage() {
    }

    public AiUsage(User user) {
        this.user = user;
    }

    public void increment() {
        this.used++;
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public LocalDate getUsageDay() { return usageDay; }
    public int getUsed() { return used; }
}
