/*
|--------------------------------------------------------------------------
| Kernel pg_notify listener bootstrap
|--------------------------------------------------------------------------
|
| Starts the dedicated pg LISTEN client for the kernel_transition_committed
| channel so the /api/kernel/events/stream SSE endpoint can re-emit kernel
| events (mirrors kernel-srv's startNotifyListener(pool) at boot).
|
*/

import { startNotifyListener } from '#services/kernel_notify'

startNotifyListener()
