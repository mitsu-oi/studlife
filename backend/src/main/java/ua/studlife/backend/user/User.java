package ua.studlife.backend.user;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * КОРИСТУВАЧ (акаунт гравця).
 *
 * Цей клас — «дзеркало» таблиці app.users у базі. Одна така змінна в коді =
 * один рядок у таблиці. Java-бібліотека Hibernate сама перекладає між ними:
 * ми працюємо зі звичайним об'єктом, а вона пише й читає SQL за нас.
 *
 * ⚠️ ПАРОЛЯ ТУТ НЕМА і не буде. Зберігається лише його ХЕШ —
 * незворотний відбиток. Детальніше — у UserService.
 */
@Entity                       // «це дзеркало таблиці»
@Table(name = "users", schema = "app")   // якої саме таблиці
public class User {

    /**
     * Номер запису. Його придумує сама база (GENERATED ALWAYS AS IDENTITY),
     * тому ми його ніколи не задаємо руками — інакше два гравці могли б
     * отримати однаковий номер.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Логін. unique = база фізично не дасть створити двох однакових. */
    @Column(nullable = false, unique = true)
    private String username;

    /** Відбиток пароля (BCrypt). Сам пароль не зберігається ніде і ніколи. */
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** 'PLAYER' — звичайний гравець, 'ADMIN' — Даша (більший ліміт ШІ тощо). */
    @Column(nullable = false)
    private String role = "PLAYER";

    /** Заблокованому вхід закритий — на випадок зловживань. */
    @Column(name = "is_blocked", nullable = false)
    private boolean blocked = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    // ---------- Порожній конструктор ----------
    // Потрібен Hibernate: коли вона дістає рядок з бази, то спершу створює
    // порожній об'єкт, а потім заповнює поля. Ми ним не користуємось.
    protected User() {
    }

    /** Так створюємо нового користувача в коді. */
    public User(String username, String passwordHash) {
        this.username = username;
        this.passwordHash = passwordHash;
    }

    // ---------- Геттери й сеттери ----------
    // «Геттер» — метод, що віддає значення поля, «сеттер» — записує.
    // У Java прийнято не пускати чужий код прямо до полів, а лише через них:
    // так можна будь-коли додати перевірку, нічого не переписуючи довкола.

    public Long getId() { return id; }

    public String getUsername() { return username; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public boolean isBlocked() { return blocked; }
    public void setBlocked(boolean blocked) { this.blocked = blocked; }

    public Instant getCreatedAt() { return createdAt; }

    public Instant getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(Instant lastLoginAt) { this.lastLoginAt = lastLoginAt; }
}
