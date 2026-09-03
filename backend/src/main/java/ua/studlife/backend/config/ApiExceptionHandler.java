package ua.studlife.backend.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * ПЕРЕКЛАДАЧ ПОМИЛОК — робить із технічних збоїв зрозумілі людині фрази.
 *
 * НАВІЩО: за замовчуванням сервер відповідає сухим "Bad Request". Гравець
 * із такого не зрозуміє нічого — а ми ж написали нормальні пояснення
 * («Пароль має бути щонайменше 6 символів»), вони просто губились дорогою.
 *
 * @RestControllerAdvice означає «стеж за ВСІМА контролерами». Достатньо
 * описати обробку тут один раз — і вона діє скрізь, у кожній частині гри.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /**
     * Не пройшли перевірки бланка (@NotBlank, @Size, @Pattern).
     *
     * Збираємо ВСІ порушення одразу, а не перше-ліпше: якщо в людини
     * і логін короткий, і пароль слабкий — хай виправить за один раз,
     * а не дізнається про другу помилку після виправлення першої.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getDefaultMessage())
                .distinct()
                .collect(Collectors.joining(". "));

        return build(HttpStatus.BAD_REQUEST,
                message.isBlank() ? "Дані заповнені неправильно" : message);
    }

    /**
     * Запит зіпсований або не схожий на JSON.
     *
     * Це ПОМИЛКА ТОГО, ХТО НАДІСЛАВ, а не сервера — тому 400, а не 500.
     * Раніше такий випадок падав у «щось пішло не так на сервері», і
     * виглядало, ніби зламались ми, хоча насправді прийшло сміття.
     *
     * Причини бувають різні: обірваний зв'язок, зіпсоване кодування
     * (кирилиця, надіслана як не-UTF-8), або хтось навмисно шле сміття.
     */
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(
            org.springframework.http.converter.HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "Запит зіпсований або не у форматі JSON");
    }

    /**
     * Помилки, які ми кидаємо свідомо: «логін зайнятий», «пароль не той».
     * Текст ми вже написали в UserService — просто передаємо його далі.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(ResponseStatusException ex) {
        String reason = ex.getReason() != null ? ex.getReason() : "Не вдалося виконати запит";
        return build(HttpStatus.valueOf(ex.getStatusCode().value()), reason);
    }

    /**
     * ТАКОЇ АДРЕСИ НЕМА — звичайне 404, а не аварія.
     *
     * ⚠️ Без цього обробника «нема сторінки» падало в загальну сітку нижче
     * і перетворювалось на 500 «щось пішло не так на сервері» з повним
     * стеком у логах. Наслідки були неприємні:
     *   - відкриваєш корінь сайту в браузері — бачиш аварію замість «нема»
     *   - браузер сам просить /favicon.ico, і кожен такий запит лишав
     *     у логах простирадло стека
     *   - серед тих простирадл не видно СПРАВЖНІХ поломок
     *
     * Тепер сервер спокійно каже 404 і нічого не пише в лог: те, що хтось
     * попросив неіснуючу адресу, — не наша проблема й не подія.
     */
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(
            org.springframework.web.servlet.resource.NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "Такої адреси нема");
    }

    /**
     * Усе інше — те, чого ми не передбачили.
     *
     * ⚠️ Гравцю НЕ показуємо технічних подробиць: назви класів і рядки коду
     * підказали б зловмиснику, як влаштований сервер. Йому — коротка фраза,
     * а повний опис іде в лог сервера, де його побачимо тільки ми.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception ex) {
        System.err.println("НЕОЧІКУВАНА ПОМИЛКА: " + ex);
        ex.printStackTrace();
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Щось пішло не так на сервері");
    }

    /** Спільний формат відповіді: {"status": 400, "error": "текст"} */
    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status.value());
        body.put("error", message);
        return ResponseEntity.status(status).body(body);
    }
}
