## OSC Generic

In instaces tab specify the ip and port you want to send. In button actions tab specify the OSC path and value.

**Available actions for OSC Generic:**

- Send message without arguments
- Send integer
- Send float
- Send string
- Send message with multiple arguments
- Send boolean (this is not part of OSC standard and may only work with some receivers)
- Send blob (Base64 & Hex)

**Available feedback for OSC Generic:**

- Listen for OSC messages (Integer)
- Listen for OSC messages (Float)
- Listen for OSC messages (Boolean)
- Listen for OSC messages (Multiple Arguments)
- Listen for OSC messages (No Arguments)

**Available variables for OSC Generic:**
- Latest OSC message received timestamp: `$(osc:latest_received_timestamp)`
- Latest OSC message received: `$(osc:latest_received_raw)`
- Latest OSC path received: `$(osc:latest_received_path)`
- Latest OSC message received client (UDP only): `$(osc:latest_received_client)`
- Latest OSC message received port (UDP only): `$(osc:latest_received_port)`
- Latest OSC arguments received: `$(osc:latest_received_args)`
- Latest OSC argument 1 received: `$(osc:latest_received_arg1)`
- Latest OSC argument 2 received: `$(osc:latest_received_arg2)`
- Latest OSC argument 3 received: `$(osc:latest_received_arg3)`
- Latest OSC argument 4 received: `$(osc:latest_received_arg4)`
- Latest OSC argument 5 received: `$(osc:latest_received_arg5)`
- Latest OSC message sent timestamp: `$(osc:latest_sent_timestamp)`
- Latest OSC message sent: `$(osc:latest_sent_raw)`
- Latest OSC path sent: `$(osc:latest_sent_path)`
- Latest OSC command type sent: `$(osc:latest_sent_type)`
- Latest OSC arguments sent: `$(osc:latest_sent_args)`
- Latest OSC argument 1 sent: `$(osc:latest_sent_arg1)`
- Latest OSC argument 2 sent: `$(osc:latest_sent_arg2)`
- Latest OSC argument 3 sent: `$(osc:latest_sent_arg3)`
- Latest OSC argument 4 sent: `$(osc:latest_sent_arg4)`
- Latest OSC argument 5 sent: `$(osc:latest_sent_arg5)`