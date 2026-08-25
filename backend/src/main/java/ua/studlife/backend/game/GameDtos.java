package ua.studlife.backend.game;

import jakarta.validation.constraints.*;

import java.util.Map;

/** Бланки для збереження й завантаження гри. */
public class GameDtos {

    /**
     * ЗБЕРЕЖЕННЯ — що гра надсилає серверу.
     *
     * Межі описані прямо тут, і Spring перевірить їх ДО нашого коду.
     * Це перший рубіж: очевидну нісенітницю («енергія 500») сервер
     * відкине одразу, навіть не турбуючи базу.
     */
    public record SaveRequest(
            @Min(value = 1, message = "День не може бути менший за 1")
            @Max(value = 31, message = "У грі всього 30 днів")
            int day,

            @Pattern(regexp = "morning|day|evening|night", message = "Невідома фаза дня")
            String phase,

            @Min(value = 0, message = "Гроші не можуть бути від'ємні")
            @Max(value = 99999, message = "Забагато грошей навіть для стипендії")
            int money,

            @Min(0) @Max(100) int energy,
            @Min(0) @Max(100) int mental,
            @Min(0) @Max(100) int social,
            @Min(0) @Max(100) int study,

            Map<String, Object> flags,
            Map<String, Object> counters
    ) {}

    /**
     * ЗАВЕРШЕННЯ ГРИ — коли гравець дожив до 30-го дня або програв.
     */
    public record FinishRequest(
            @Pattern(regexp = "FINISHED|LOST", message = "Невідомий результат")
            String status,
            String ending,
            Integer finalScore
    ) {}

    /**
     * ВІДПОВІДЬ — стан гри, який сервер віддає грі.
     *
     * Формат навмисно збігається з gameState у js/state.js, щоб гра могла
     * підхопити його майже без переробок.
     */
    public record GameResponse(
            Long id,
            int day,
            String phase,
            Stats stats,
            Map<String, Object> flags,
            Map<String, Object> counters,
            String status,
            String ending,
            Integer finalScore
    ) {
        /** Шкали окремим об'єктом — як у грі. */
        public record Stats(int money, int energy, int mental, int social, int study) {}

        public static GameResponse from(GameRun run) {
            return new GameResponse(
                    run.getId(),
                    run.getDay(),
                    run.getPhase(),
                    new Stats(run.getMoney(), run.getEnergy(), run.getMental(),
                              run.getSocial(), run.getStudy()),
                    run.getFlags(),
                    run.getCounters(),
                    run.getStatus(),
                    run.getEnding(),
                    run.getFinalScore()
            );
        }
    }
}
