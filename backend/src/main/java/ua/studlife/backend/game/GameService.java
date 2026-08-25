package ua.studlife.backend.game;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ua.studlife.backend.game.GameDtos.FinishRequest;
import ua.studlife.backend.game.GameDtos.SaveRequest;
import ua.studlife.backend.user.User;

import java.time.Instant;
import java.util.HashMap;
import java.util.Optional;

/**
 * ІНСПЕКТОР ІГОР — створює, зберігає й завершує проходження.
 *
 * ⚠️ ГОЛОВНЕ ПРО ЧЕСНІСТЬ.
 * Логіка гри (скільки додати енергії за сон) рахується в браузері, і сервер
 * її не повторює — інакше довелося б переписати всю гру ще раз на Java.
 *
 * Тому сервер робить інше: перевіряє, що надіслане ОСУДНЕ.
 * Це не робить шахрайство неможливим, але робить його непомітно грубим:
 *  • шкали мусять бути в межах (це вже перевірив бланк);
 *  • день не може стрибнути з 3-го на 25-й;
 *  • день не може піти назад;
 *  • чужу гру чіпати не можна взагалі.
 *
 * А для головної мети — захисту ШІ — цього досить: історію виборів
 * пише сам сервер, і саме її братиме для промпту.
 */
@Service
public class GameService {

    /** Наскільки день може зрушити за одне збереження. */
    private static final int MAX_DAY_JUMP = 1;

    private final GameRunRepository runs;

    public GameService(GameRunRepository runs) {
        this.runs = runs;
    }

    /** Поточна (активна) гра гравця, якщо є. */
    @Transactional(readOnly = true)
    public Optional<GameRun> findActive(User user) {
        return runs.findByUserAndStatus(user, "ACTIVE");
    }

    /**
     * НОВА ГРА.
     *
     * Якщо стара ще триває — позначаємо її як програну й закриваємо.
     * Інакше база не дасть створити другу (там стоїть правило
     * «одна активна гра на гравця»), і гравець застряг би назавжди.
     */
    @Transactional
    public GameRun startNew(User user) {
        runs.findByUserAndStatus(user, "ACTIVE").ifPresent(old -> {
            old.setStatus("LOST");
            old.setEnding("abandoned");   // «покинута», а не програна по-справжньому
            old.setFinishedAt(Instant.now());
            runs.save(old);
        });

        return runs.save(new GameRun(user));
    }

    /**
     * ЗБЕРЕЖЕННЯ СТАНУ.
     */
    @Transactional
    public GameRun save(User user, SaveRequest req) {
        GameRun run = runs.findByUserAndStatus(user, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Активної гри немає — почни нову"));

        // ---------- перевірка осудності ----------
        int currentDay = run.getDay();

        if (req.day() < currentDay) {
            // повернення в минуле = спроба переграти невдалий день
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "День не може йти назад (зараз " + currentDay + ", надіслано " + req.day() + ")");
        }
        if (req.day() > currentDay + MAX_DAY_JUMP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Забагато днів за раз (зараз " + currentDay + ", надіслано " + req.day() + ")");
        }

        // ---------- записуємо ----------
        run.setDay((short) req.day());
        run.setPhase(req.phase());
        run.setMoney(req.money());
        run.setEnergy((short) req.energy());
        run.setMental((short) req.mental());
        run.setSocial((short) req.social());
        run.setStudy((short) req.study());
        run.setFlags(req.flags() != null ? req.flags() : new HashMap<>());
        run.setCounters(req.counters() != null ? req.counters() : new HashMap<>());

        return runs.save(run);
    }

    /**
     * ЗАВЕРШЕННЯ ГРИ — дожив до 30-го дня або програв.
     * Після цього гра стає незмінною: історія, яку не переписати.
     */
    @Transactional
    public GameRun finish(User user, FinishRequest req) {
        GameRun run = runs.findByUserAndStatus(user, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Активної гри немає"));

        run.setStatus(req.status());
        run.setEnding(req.ending());
        run.setFinalScore(req.finalScore());
        run.setFinishedAt(Instant.now());

        return runs.save(run);
    }
}
