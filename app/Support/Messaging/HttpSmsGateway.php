<?php

namespace App\Support\Messaging;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Sends messages through any SMS provider with a plain HTTP API: the
 * address, the method, and the names of its "to", "message" and "sender"
 * fields come from `services.sms.http`, plus any fixed fields it needs
 * (an API key, a message type). A reply that isn't 2xx — or, when
 * `success_match` is set, doesn't contain that text — counts as refused.
 */
class HttpSmsGateway implements SmsGateway
{
    /**
     * @param  array{url: ?string, method: string, token: ?string, to_param: string, message_param: string, sender_param: string, sender: ?string, extra_params: ?string, success_match: ?string, phone_format: string}  $config
     */
    public function __construct(private array $config, private string $countryCode) {}

    public function send(string $phone, string $body): void
    {
        if (blank($this->config['url'])) {
            throw new SmsDeliveryFailed('لم يُضبط عنوان بوابة الرسائل (SMS_HTTP_URL).');
        }

        parse_str((string) $this->config['extra_params'], $extra);

        $fields = [
            ...$extra,
            $this->config['to_param'] => $this->config['phone_format'] === 'local'
                ? PhoneNumber::digits($phone)
                : PhoneNumber::international($phone, $this->countryCode),
            $this->config['message_param'] => $body,
        ];

        if (filled($this->config['sender'])) {
            $fields[$this->config['sender_param']] = $this->config['sender'];
        }

        $request = Http::timeout(20)->acceptJson();

        if (filled($this->config['token'])) {
            $request = $request->withToken($this->config['token']);
        }

        try {
            $response = strtolower($this->config['method']) === 'get'
                ? $request->get($this->config['url'], $fields)
                : $request->asForm()->post($this->config['url'], $fields);
        } catch (ConnectionException $exception) {
            throw new SmsDeliveryFailed('تعذّر الاتصال ببوابة الرسائل: '.$exception->getMessage(), previous: $exception);
        }

        $successMatch = $this->config['success_match'];

        if (! $response->successful() || (filled($successMatch) && ! str_contains($response->body(), $successMatch))) {
            throw new SmsDeliveryFailed('رفضت بوابة الرسائل الإرسال ('.$response->status().'): '.Str::limit($response->body(), 150));
        }
    }

    public function deliversMessages(): bool
    {
        return true;
    }
}
