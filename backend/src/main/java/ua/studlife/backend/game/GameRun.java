package ua.studlife.backend.game;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import ua.studlife.backend.user.User;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * ПРОХОДЖЕННЯ — одна гра одного гравця.
 *
 * Це дзеркало таблиці game.runs. По суті — те саме, що зараз лежить
 * у браузері в gameState (js/state.js), тільки тепер на сервері.
 */
@Entity
@Table(name = "runs", schema = "game")
public class GameRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * ЧИЯ ЦЕ ГРА — той самий зв'язок, заради якого був потрібен id гравця.
     *
     * @ManyToOne = «багато ігор належать одному гравцю».
     * FetchType.LAZY означає «не тягни гравця з бази, поки не спитають» —
     * інакше кожне завантаження гри тягло б за собою зайвий запит.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // ---------- де гравець зараз ----------
    @Column(nullable = false)
    private short day = 1;

    @Column(nullable = false)
    private String phase = "morning";

    // ---------- п'ять шкал ----------
    @Column(nullable = false)
    private int money = 1500;

    @Column(nullable = false)
    private short energy = 70;

    @Column(nullable = false)
    private short mental = 70;

    @Column(nullable = false)
    private short social = 50;

    @Column(nullable = false)
    private short study = 60;

    /**
     * ПРАПОРЦІ й ЛІЧИЛЬНИКИ — у форматі JSON.
     *
     * Чому не окремими колонками: їх десятки, і щотижня додаються нові
     * (квести, куплені предмети, форс-мажори). Робити колонку під кожен —
     * означає переписувати таблицю після кожної нової механіки.
     *
     * JSONB — це «вільна форма» всередині однієї клітинки. PostgreSQL уміє
     * такі дані ще й шукати, тож у майбутньому можна буде спитати базу
     * «покажи всіх, хто купив принтер», не міняючи структуру.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> flags = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> counters = new HashMap<>();

    // ---------- підсумки ----------
    /** ACTIVE — триває, FINISHED — дожив до 30-го дня, LOST — програв. */
    @Column(nullable = false)
    private String status = "ACTIVE";

    private String ending;

    @Column(name = "final_score")
    private Integer finalScore;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected GameRun() {
    }

    public GameRun(User user) {
        this.user = user;
    }

    /**
     * Спрацьовує САМО перед кожним записом у базу.
     * Так ми не забудемо оновити час — а забути легко.
     */
    @PreUpdate
    void beforeUpdate() {
        this.updatedAt = Instant.now();
    }

    // ---------- геттери й сеттери ----------

    public Long getId() { return id; }
    public User getUser() { return user; }

    public short getDay() { return day; }
    public void setDay(short day) { this.day = day; }

    public String getPhase() { return phase; }
    public void setPhase(String phase) { this.phase = phase; }

    public int getMoney() { return money; }
    public void setMoney(int money) { this.money = money; }

    public short getEnergy() { return energy; }
    public void setEnergy(short energy) { this.energy = energy; }

    public short getMental() { return mental; }
    public void setMental(short mental) { this.mental = mental; }

    public short getSocial() { return social; }
    public void setSocial(short social) { this.social = social; }

    public short getStudy() { return study; }
    public void setStudy(short study) { this.study = study; }

    public Map<String, Object> getFlags() { return flags; }
    public void setFlags(Map<String, Object> flags) { this.flags = flags; }

    public Map<String, Object> getCounters() { return counters; }
    public void setCounters(Map<String, Object> counters) { this.counters = counters; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getEnding() { return ending; }
    public void setEnding(String ending) { this.ending = ending; }

    public Integer getFinalScore() { return finalScore; }
    public void setFinalScore(Integer finalScore) { this.finalScore = finalScore; }

    public Instant getStartedAt() { return startedAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
