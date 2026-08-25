package ua.studlife.backend.user;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import ua.studlife.backend.user.AuthDtos.LoginRequest;
import ua.studlife.backend.user.AuthDtos.RegisterRequest;
import ua.studlife.backend.user.AuthDtos.UserResponse;

/**
 * ВІКОНЦЕ ПРИЙОМУ — сюди стукає гра.
 *
 * Контролер навмисно тонкий: прийняв → передав інспектору → віддав відповідь.
 * Жодних рішень тут не ухвалюється.
 *
 * Адреси (їх ще звуть «ендпоінти»):
 *   POST /api/auth/register — створити акаунт
 *   POST /api/auth/login    — увійти
 *   POST /api/auth/logout   — вийти
 *   GET  /api/auth/me       — «хто я зараз?»
 */
@RestController                       // «відповідай даними, не сторінками»
@RequestMapping("/api/auth")          // спільний початок усіх адрес нижче
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    /**
     * РЕЄСТРАЦІЯ і одразу вхід — щоб людина не вводила пароль двічі поспіль.
     *
     * @Valid запускає перевірки з бланка (довжина логіна, пароля тощо).
     * Не пройшли — наш код навіть не виконається, гравець одразу отримає
     * список того, що не так.
     */
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest req,
                                                 HttpServletRequest httpRequest) {
        User user = userService.register(req.username(), req.password());
        startSession(user, httpRequest);
        // 201 Created — «створено нове», а не просто 200 «ок»
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }

    /** ВХІД. */
    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest req,
                              HttpServletRequest httpRequest) {
        User user = userService.login(req.username(), req.password());
        startSession(user, httpRequest);
        return UserResponse.from(user);
    }

    /**
     * ВИХІД — знищуємо сесію.
     * Після цього «номерок із гардеробу» стає недійсним.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();  // 204: зроблено, відповідати нічим
    }

    /**
     * «ХТО Я?» — гра питає при завантаженні: чи я вже увійшов?
     * Якщо ні — покаже екран входу.
     *
     * Чому ходимо в базу, а не читаємо лише сесію:
     * у сесії лежить тільки логін і роль — саме тому раніше id повертався
     * порожнім (null). А номер гравця нам потрібен: далі за ним шукатимемо
     * ЙОГО збережені ігри в game.runs і ЙОГО вибори в game.choices.
     *
     * Бонус від походу в базу: дані завжди свіжі. Якщо гравця заблокували
     * щойно — він дізнається про це одразу, а не після перезаходу.
     * Запит дешевий: пошук за username іде по унікальному індексу.
     */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return userService.findByUsername(auth.getName())
                // заблокований — сесія більше не діє
                .filter(user -> !user.isBlocked())
                .map(user -> ResponseEntity.ok(UserResponse.from(user)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    /**
     * ВІДКРИТИ СЕСІЮ — тут гравець стає «впізнаним».
     *
     * Що таке сесія: сервер запам'ятовує, що номерок XYZ належить Даші,
     * і віддає цей номерок браузеру у вигляді cookie. Далі браузер сам
     * прикладає його до кожного запиту — і сервер щоразу знає, хто прийшов,
     * не питаючи пароль знову.
     *
     * ⚠️ Чому саме сесія, а не «токен» (JWT), як планувалось у ROADMAP:
     *  • номерок лежить у cookie з позначкою HttpOnly — і тоді до нього
     *    НЕ МАЄ ДОСТУПУ жоден скрипт на сторінці. Токен же зазвичай кладуть
     *    у localStorage, звідки його може вкрасти будь-який чужий скрипт;
     *  • сесію можна миттєво скасувати з боку сервера (заблокувати гравця),
     *    а виданий токен живе до кінця свого терміну, і відкликати його важко;
     *  • Spring робить це з коробки — менше коду, менше місць помилитись.
     * Токени потрібні там, де багато окремих сервісів або мобільний застосунок.
     * У нас один сервер і браузер — сесія і простіша, і безпечніша.
     */
    private void startSession(User user, HttpServletRequest request) {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                user.getUsername(),
                null,   // пароль далі не потрібен і не зберігається
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole()))
        );

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);

        // прив'язуємо до сесії, щоб гравець лишався впізнаним і після
        // перезавантаження сторінки
        request.getSession(true).setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
    }
}
