package ua.studlife.backend.user;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

/**
 * ІНСПЕКТОР — тут ухвалюються рішення: пускати, відмовити, створити акаунт.
 *
 * Уся логіка живе тут, а не в контролері. Контролер має лише приймати
 * й віддавати; щойно він починає щось вирішувати — код перетворюється
 * на кашу, яку неможливо перевірити тестами.
 */
@Service   // «Spring, це твій робітник — створи його сам і давай іншим»
public class UserService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    /**
     * Spring САМ передасть сюди архіваріуса й шифрувальника при створенні.
     * Це зветься «впровадження залежностей»: об'єкт не шукає собі
     * помічників сам, їх приносять ззовні. Завдяки цьому в тестах можна
     * підсунути підроблених помічників і перевірити логіку без бази.
     */
    public UserService(UserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * РЕЄСТРАЦІЯ.
     *
     * 🔑 Найважливіший рядок тут — passwordEncoder.encode(). Пояснюю, що він робить.
     *
     * Пароль НІКОЛИ не зберігається як текст. Замість нього рахується ХЕШ —
     * відбиток фіксованої довжини, з якого НЕМОЖЛИВО відновити оригінал.
     * Це вулиця з одностороннім рухом:
     *
     *      "мійпароль123"  →  "$2a$10$N9qo8uLOickgx2ZMRZo..."   ✅ легко
     *      "$2a$10$N9qo8..."  →  "мійпароль123"                  ❌ неможливо
     *
     * Тому при вході ми НЕ «розшифровуємо» збережене. Ми хешуємо введений
     * пароль ще раз і порівнюємо два відбитки.
     *
     * Наслідок: навіть якщо базу вкрадуть, паролів там немає. І навіть ми
     * самі не можемо дізнатись пароль гравця — тільки скинути його.
     *
     * BCrypt (наш алгоритм) має ще дві важливі властивості:
     *  • «сіль» — до кожного пароля домішується випадковий шматок, тому
     *    двоє людей з однаковим паролем матимуть РІЗНІ хеші;
     *  • навмисна повільність — ~100 мс на хеш. Людина не помітить, а от
     *    перебір мільярда варіантів стає нездійсненно довгим.
     */
    @Transactional
    public User register(String username, String rawPassword) {
        // логіни порівнюємо без урахування регістру: «Dasha» і «dasha» —
        // одна й та сама людина, інакше плутанина й крадіжка схожих імен
        String login = username.trim().toLowerCase();

        if (users.existsByUsername(login)) {
            // 409 Conflict — «такий уже є». Саме цей код означає
            // «твій запит правильний, але суперечить тому, що вже існує»
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Такий логін уже зайнятий");
        }

        String hash = passwordEncoder.encode(rawPassword);   // ← ось воно
        return users.save(new User(login, hash));
    }

    /**
     * Знайти гравця за логіном — потрібно для «хто я?».
     *
     * @Transactional(readOnly = true) — позначка «тільки читаю, нічого не міняю».
     * База може виконати такий запит швидше, і це страхує від випадкового
     * запису там, де його не мало бути.
     */
    @Transactional(readOnly = true)
    public java.util.Optional<User> findByUsername(String username) {
        return users.findByUsername(username.trim().toLowerCase());
    }

    /**
     * ВХІД: перевіряємо, що така людина є і пароль збігається.
     *
     * ⚠️ Помилка тут ЗАВЖДИ однакова — «неправильний логін або пароль».
     * Ніколи не кажемо окремо «такого користувача немає» чи «пароль не той»:
     * інакше зловмисник міг би перебором з'ясувати, які логіни існують,
     * і далі підбирати пароль уже прицільно.
     */
    @Transactional
    public User login(String username, String rawPassword) {
        String login = username.trim().toLowerCase();

        User user = users.findByUsername(login)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Неправильний логін або пароль"));

        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Неправильний логін або пароль");
        }

        if (user.isBlocked()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Акаунт заблоковано");
        }

        user.setLastLoginAt(Instant.now());
        return user;
    }
}
