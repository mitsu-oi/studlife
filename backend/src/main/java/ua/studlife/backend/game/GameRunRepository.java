package ua.studlife.backend.game;

import org.springframework.data.jpa.repository.JpaRepository;
import ua.studlife.backend.user.User;

import java.util.List;
import java.util.Optional;

/** Архіваріус для таблиці game.runs. */
public interface GameRunRepository extends JpaRepository<GameRun, Long> {

    /**
     * Активна гра конкретного гравця.
     *
     * Назва знову є завданням: «знайди (find) за (By) гравцем (User)
     * і (And) статусом (Status)». Spring сам напише запит.
     *
     * У базі стоїть правило, що активна гра може бути тільки одна
     * (той унікальний індекс із міграції V2) — тому Optional, а не список.
     */
    Optional<GameRun> findByUserAndStatus(User user, String status);

    /** Усі ігри гравця — для сторінки «мої проходження». */
    List<GameRun> findByUserOrderByStartedAtDesc(User user);

    /**
     * Найкращі результати — для майбутнього рейтингу.
     * Беремо лише завершені й лише ті, де є рахунок.
     */
    List<GameRun> findTop20ByStatusAndFinalScoreIsNotNullOrderByFinalScoreDesc(String status);
}
