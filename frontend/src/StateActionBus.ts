export class StateActionBus {
    // The central brain: stores all user input (e.g., { "/form/email": "cyrus@test.com" })
    private dataModel: Record<string, any> = {};
    
    // The URL where we send user actions back to the LLM backend
    private actionEndpoint: string;
    private onStreamChunk?: (chunk: string) => void;
    private subscribers = new Map<string, Set<(value: any) => void>>();

    constructor(actionEndpoint: string, onStreamChunk?: (chunk: string) => void) {
        this.actionEndpoint = actionEndpoint;
        this.onStreamChunk = onStreamChunk;
    }

    /**
     * THE STATE MUTATOR
     * Input components (TextFields, Checkboxes) call this when the user types.
     */
    public updateState(path: string, value: any) {
        // In A2UI, the path is usually a JSON Pointer like "/form/username"
        this.dataModel[path] = value;
        this.subscribers.get(path)?.forEach(listener => listener(value));
        console.log(`[A2Kit State Updated] ${path}:`, value);
    }

    public getState(path: string) {
        return this.dataModel[path];
    }

    public subscribe(path: string, listener: (value: any) => void) {
        const listeners = this.subscribers.get(path) || new Set();
        listeners.add(listener);
        this.subscribers.set(path, listeners);
        listener(this.dataModel[path]);
        return () => listeners.delete(listener);
    }
    
    /**
     * THE ACTION DISPATCHER
     * Button components call this to send events back to the AI.
     */
    public async dispatch(eventName: string, context: Record<string, any> = {}) {
        console.log(`[A2Kit Dispatching Action] ${eventName}`);
        
        // We package the event name, any specific context, AND the entire user state
        const payload = {
            action: {
                event: {
                    name: eventName,
                    context: context
                }
            },
            // The AI needs the dataModel to know what the user typed!
            state: this.dataModel 
        };

        try {
            const response = await fetch(this.actionEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("Failed to send action to AI:", response.statusText);
                return;
            }

            if (!response.body || !this.onStreamChunk) return;

            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                buffer += value || '';

                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() || '';
                for (const event of events) {
                    const data = event
                        .split(/\r?\n/)
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trimStart())
                        .join('\n');
                    if (data) this.onStreamChunk(data);
                }

                if (done) break;
            }
        } catch (error) {
            console.error("Network error dispatching A2UI action:", error);
        }
    }
} // End of class