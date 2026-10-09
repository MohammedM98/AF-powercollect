<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Tells the people who audit statements that a branch has sent one. Shown
 * under the bell like the user's own actions, so it uses the same
 * `action`/`subject` shape.
 */
class AuditStatementSubmitted extends Notification
{
    use Queueable;

    /**
     * @param  string  $period  the days the statement covers, already written for reading
     */
    public function __construct(public string $branchName, public string $typeLabel, public string $period) {}

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * Get the array representation of the notification.
     *
     * @return array{action: string, subject: string}
     */
    public function toArray(object $notifiable): array
    {
        return [
            'action' => 'audit-statement-submitted',
            'subject' => "{$this->branchName} — كشف {$this->typeLabel} {$this->period}",
        ];
    }
}
