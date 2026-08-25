package ua.studlife.backend.user;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

/**
 * АРХІВАРІУС — єдиний, хто ходить до таблиці app.users.
 *
 * Тут відбувається найдивніша магія Spring: ми пишемо тільки ОПИС того,
 * що хочемо, і жодного коду всередині. Реалізацію Spring створює сам,
 * під час запуску програми.
 *
 * Звідки він знає, що робити? З НАЗВИ методу. Побачив
 * findByUsername — розібрав по словах: «знайди (find) за (By) полем
 * username» — і сам написав SQL-запит:
 *      SELECT * FROM app.users WHERE username = ?
 *
 * Тому назви методів тут — не просто назви, це фактично і є завдання.
 * Помилишся в назві поля — програма не запуститься і чесно про це скаже.
 *
 * JpaRepository<User, Long> означає: «працюю з User, номер у нього Long».
 * Разом із цим ми задарма отримуємо готові save(), findById(), delete(),
 * findAll() і ще десяток — їх писати не треба взагалі.
 */
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Знайти гравця за логіном.
     *
     * Повертає Optional — «коробочку, у якій може бути порожньо».
     * Так у Java прийнято казати «результату може не бути»: це змушує
     * того, хто викликає, свідомо обробити випадок «не знайдено»,
     * а не отримати раптову помилку на порожньому місці.
     */
    Optional<User> findByUsername(String username);

    /** Чи існує вже такий логін — потрібно при реєстрації. */
    boolean existsByUsername(String username);
}
