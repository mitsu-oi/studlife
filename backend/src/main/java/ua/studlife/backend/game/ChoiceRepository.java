package ua.studlife.backend.game;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Архіваріус для історії виборів. */
public interface ChoiceRepository extends JpaRepository<Choice, Long> {

    /**
     * Останні вибори в цій грі — саме їх сервер вставить у промпт для ШІ.
     * Limit обмежує кількість прямо в запиті до бази: тягнути всі 90 виборів
     * за 30 днів, щоб узяти п'ять, було б марно.
     */
    List<Choice> findByRunOrderByCreatedAtDesc(GameRun run, Limit limit);

    /** Теми останніх ШІ-карток — щоб не повторювались. */
    List<Choice> findByRunAndTopicIsNotNullOrderByCreatedAtDesc(GameRun run, Limit limit);
}
