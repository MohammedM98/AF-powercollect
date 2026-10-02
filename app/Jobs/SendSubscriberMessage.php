<?php

namespace App\Jobs;

use App\Enums\MessageStatus;
use App\Models\SubscriberMessage;
use App\Support\Messaging\SmsDeliveryFailed;
use App\Support\Messaging\SmsGateway;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Sends one SMS to a subscriber through the SMS gateway, and records
 * whether it went out. A message that was already sent is left alone, so
 * sending a batch again only retries what's still waiting or failed.
 */
class SendSubscriberMessage implements ShouldQueue
{
    use Queueable;

    public function __construct(public SubscriberMessage $message) {}

    public function handle(SmsGateway $gateway): void
    {
        $message = $this->message->fresh();

        if ($message === null || $message->status === MessageStatus::Sent) {
            return;
        }

        try {
            $gateway->send($message->phone, $message->body);
        } catch (SmsDeliveryFailed $exception) {
            $message->markFailed($exception->getMessage());

            return;
        }

        $message->markSent();
    }
}
