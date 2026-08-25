package ua.studlife.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * ІНСТРУКЦІЯ ОХОРОНЦЮ: кого пускати, кого зупиняти, звідки приймати гостей.
 *
 * Нагадаю: Spring Security за замовчуванням замикає ВСЕ (саме тому ми
 * бачили 401 на порожньому сервері). Тут ми свідомо відчиняємо рівно
 * стільки, скільки треба — і ні краплі більше.
 */
@Configuration
public class SecurityConfig {

    /**
     * ШИФРУВАЛЬНИК ПАРОЛІВ.
     *
     * BCrypt — алгоритм, спеціально створений для паролів. Головна його
     * особливість — НАВМИСНА повільність: один хеш рахується ~100 мс.
     * Людина при вході цього не помітить, а от підбір мільйонів варіантів
     * стає безнадійно повільним.
     *
     * Число 10 — «складність». Кожна +1 подвоює час обчислення.
     * 10 — розумний баланс на сьогодні.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    /**
     * ПРАВИЛА ДОСТУПУ.
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // ---------- звідки приймаємо запити ----------
            .cors(cors -> cors.configurationSource(corsSource()))

            // ---------- CSRF ----------
            // Захист від того, щоб чужий сайт відправив запит від імені
            // залогіненого гравця. Поки що вимикаємо: гра — окрема сторінка,
            // яка спілкується з сервером напряму, і CSRF-токени тут лише
            // ускладнили б перші кроки. ⚠️ Перед справжнім релізом увімкнути.
            .csrf(csrf -> csrf.disable())

            // ---------- ХТО КУДИ МОЖЕ ----------
            .authorizeHttpRequests(auth -> auth
                // вхід і реєстрація мають бути відкриті — інакше зареєструватись
                // зміг би тільки той, хто вже зареєстрований 🙂
                .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                // перевірка «хто я» теж відкрита: гра питає це ще до входу,
                // щоб зрозуміти, який екран показати
                .requestMatchers("/api/auth/me", "/api/auth/logout").permitAll()
                // технічна перевірка «сервер живий?»
                .requestMatchers("/api/health").permitAll()

                // тестова сторінка й інші статичні файли (картинки, стилі):
                // це просто файли, секретів у них нема
                .requestMatchers("/", "/test.html", "/*.css", "/*.js", "/favicon.ico").permitAll()

                // ⚠️ ВАЖЛИВО: службова сторінка помилок.
                // Коли щось іде не так (закороткий пароль, зайнятий логін),
                // Spring перекидає запит СЮДИ, щоб пояснити причину.
                // Якщо не відкрити — охоронець зупиняє й цю сторінку, і гравець
                // замість «пароль закороткий» бачить «а ти хто такий?» (401).
                // Класична пастка: справжня помилка ховається за 401.
                .requestMatchers("/error").permitAll()
                // ВСЕ ІНШЕ — тільки для тих, хто увійшов
                .anyRequest().authenticated()
            )

            // ---------- що робити з невпізнаними ----------
            // За замовчуванням Spring показав би віконце браузера з паролем
            // (те саме, що ти бачила). Для гри це не годиться: хай сервер
            // просто відповідає 401, а гра сама покаже свій екран входу.
            .exceptionHandling(ex -> ex.authenticationEntryPoint(
                    new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))

            // вбудоване віконце браузера і форму входу вимикаємо —
            // у нас власний екран у грі
            .httpBasic(basic -> basic.disable())
            .formLogin(form -> form.disable());

        return http.build();
    }

    /**
     * CORS — «з яких сайтів дозволено звертатись».
     *
     * Браузер за замовчуванням не дає сторінці з одного сайту стукати
     * на інший — це захист. Тут ми називаємо ті адреси, яким довіряємо.
     *
     * ⚠️ Саме цього бракувало ШІ-скриньці: там стояло «*» — тобто
     * будь-хто звідки завгодно. Тут одразу перелік.
     *
     * allowCredentials(true) — дозволяємо браузеру надсилати cookie
     * з номерком сесії. Без цього гравець «забувався» б на кожному запиті.
     */
    @Bean
    public CorsConfigurationSource corsSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(
                "https://mitsu-oi.github.io",   // гра в інтернеті
                "http://localhost:8081",        // сам сервер
                "http://127.0.0.1:5500",        // локальний сервер для розробки
                "null"                          // гра, відкрита файлом з диска
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
