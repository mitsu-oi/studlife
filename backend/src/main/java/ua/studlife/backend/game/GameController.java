package ua.studlife.backend.game;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import ua.studlife.backend.game.GameDtos.FinishRequest;
import ua.studlife.backend.game.GameDtos.GameResponse;
import ua.studlife.backend.game.GameDtos.SaveRequest;
import ua.studlife.backend.user.User;
import ua.studlife.backend.user.UserService;

/**
 * ВІКОНЦЕ ДЛЯ ГРИ — збереження й завантаження прогресу.
 *
 * Усі адреси тут ЗАКРИТІ: у SecurityConfig усе, крім явно відкритого,
 * вимагає входу. Тому в кожен метод Spring передає Authentication —
 * і ми точно знаємо, ЧИЯ це гра.
 *
 * Саме тут і зникає стара проблема: гравець не може сказати «я гравець №7».
 * Хто він — вирішує сервер за cookie сесії, а не за словами клієнта.
 */
@RestController
@RequestMapping("/api/game")
public class GameController {

    private final GameService games;
    private final UserService users;

    public GameController(GameService games, UserService users) {
        this.games = games;
        this.users = users;
    }

    /**
     * ПОТОЧНА ГРА — гра питає при завантаженні: «є що продовжити?»
     * Немає активної гри → 204 (порожньо, але це не помилка).
     */
    @GetMapping("/current")
    public ResponseEntity<GameResponse> current(Authentication auth) {
        User user = currentUser(auth);
        return games.findActive(user)
                .map(run -> ResponseEntity.ok(GameResponse.from(run)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** НОВА ГРА. */
    @PostMapping("/new")
    public ResponseEntity<GameResponse> startNew(Authentication auth) {
        GameRun run = games.startNew(currentUser(auth));
        return ResponseEntity.status(HttpStatus.CREATED).body(GameResponse.from(run));
    }

    /** ЗБЕРЕГТИ СТАН — гра робитиме це щоранку, як зараз робить автосейв. */
    @PutMapping("/current")
    public GameResponse save(@Valid @RequestBody SaveRequest req, Authentication auth) {
        return GameResponse.from(games.save(currentUser(auth), req));
    }

    /** ЗАВЕРШИТИ — фінал або програш. */
    @PostMapping("/finish")
    public GameResponse finish(@Valid @RequestBody FinishRequest req, Authentication auth) {
        return GameResponse.from(games.finish(currentUser(auth), req));
    }

    /**
     * Хто зараз звертається.
     *
     * Ім'я беремо з сесії (їй можна вірити — вона підписана сервером),
     * а сам запис — з бази. Якщо гравця видалили, поки він грав,
     * сесія стає недійсною.
     */
    private User currentUser(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Спершу увійди");
        }
        return users.findByUsername(auth.getName())
                .filter(u -> !u.isBlocked())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Сесія недійсна — увійди знову"));
    }
}
