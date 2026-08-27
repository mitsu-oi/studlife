package ua.studlife.backend.ai;

import org.springframework.data.jpa.repository.JpaRepository;
import ua.studlife.backend.user.User;

import java.time.LocalDate;
import java.util.Optional;

/** Архіваріус для лічильника звернень до ШІ. */
public interface AiUsageRepository extends JpaRepository<AiUsage, Long> {

    /** Скільки цей гравець витратив за конкретну добу. */
    Optional<AiUsage> findByUserAndUsageDay(User user, LocalDate day);

    /** Скільки звернень зробили ВСІ разом за добу — щоб стежити за спільним лімітом Gemini. */
    @org.springframework.data.jpa.repository.Query(
            "SELECT COALESCE(SUM(u.used), 0) FROM AiUsage u WHERE u.usageDay = :day")
    long totalUsedOn(java.time.LocalDate day);
}
