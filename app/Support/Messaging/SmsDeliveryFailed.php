<?php

namespace App\Support\Messaging;

use RuntimeException;

/**
 * The SMS gateway turned a message down, or couldn't be reached.
 */
class SmsDeliveryFailed extends RuntimeException {}
