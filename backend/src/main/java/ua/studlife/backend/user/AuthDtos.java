package ua.studlife.backend.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * БЛАНКИ — що приходить від гри і що сервер відповідає.
 *
 * Навіщо окремі класи, якщо є User? Бо User — це те, що лежить у базі,
 * разом із хешем пароля й службовими полями. Віддавати його назовні
 * не можна: у відповідь потрапив би хеш пароля.
 *
 * Тому «що всередині» і «що назовні» — принципово різні речі. Це не
 * зайва формальність, а захист: те, що не описано в бланку відповіді,
 * фізично не може витекти назовні.
 *
 * record — короткий спосіб описати «просто набір полів»: Java сама
 * зробить конструктор, геттери й порівняння.
 */
public class AuthDtos {

    /**
     * Заява на реєстрацію.
     *
     * Анотації @NotBlank, @Size, @Pattern — це ПЕРЕВІРКИ. Spring виконує
     * їх ДО того, як запит дійде до нашого коду. Не пройшло — гравець
     * одразу отримує зрозумілу відмову, а сервер навіть не турбує базу.
     *
     * Це і є та «валідація», якої бракує теперішній ШІ-скриньці: там ми
     * перевіряємо все руками, а тут перевірки описані поруч із полем.
     */
    public record RegisterRequest(
            @NotBlank(message = "Вкажи логін")
            @Size(min = 3, max = 32, message = "Логін має бути від 3 до 32 символів")
            // дозволяємо тільки букви, цифри, крапку, дефіс і підкреслення:
            // без пробілів і спецсимволів, щоб не було плутанини й трюків
            @Pattern(regexp = "^[a-zA-Z0-9._-]+$",
                     message = "Логін: лише латинські букви, цифри, крапка, дефіс, підкреслення")
            String username,

            @NotBlank(message = "Вкажи пароль")
            @Size(min = 6, max = 100, message = "Пароль має бути щонайменше 6 символів")
            String password
    ) {}

    /** Заява на вхід. Тут перевірок менше: пароль або підійде, або ні. */
    public record LoginRequest(
            @NotBlank(message = "Вкажи логін") String username,
            @NotBlank(message = "Вкажи пароль") String password
    ) {}

    /**
     * Відповідь про гравця.
     * Зверни увагу: жодного пароля й жодного хеша — тільки безпечне.
     */
    public record UserResponse(Long id, String username, String role) {
        public static UserResponse from(User u) {
            return new UserResponse(u.getId(), u.getUsername(), u.getRole());
        }
    }
}
