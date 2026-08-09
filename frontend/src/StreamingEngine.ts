export class StreamEngine {
    // This holds the broken, incomplete chunks of text
    private buffer: string = "";
    
    // This is the callback function we fire when we find a complete JSON object
    private onValidObject: (data: any) => void;

    constructor(onValidObject: (data: any) => void) {
        this.onValidObject = onValidObject;
    }

    // The outside world (the SSE connection) pushes new chunks here
    public receiveChunk(chunk: string) {
        // Strip Markdown fences and optional `json` language declarations.
        const sanitizedChunk = chunk.replace(/```json\r?\n?/gi, '').replace(/```\r?\n?/g, '');

        this.buffer += sanitizedChunk;
        this.processBuffer();
    }

    private processBuffer() {
        let openBraces = 0;
        let isInsideString = false;
        let escapeNext = false;
        let startIndex = -1;

        for (let i = 0; i < this.buffer.length; i++) {
            const char = this.buffer[i];

            // 1. Handle escape characters (like \")
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            // 2. Toggle string state so we don't count brackets inside quotes
            if (char === '"') {
                isInsideString = !isInsideString;
                continue;
            }

            // 3. Count the Brackets!
            if (!isInsideString) {
                if (char === '{') {
                    // Mark the start of a new JSON object
                    if (openBraces === 0) startIndex = i; 
                    openBraces++;
                } else if (char === '}') {
                    openBraces--;
                    
                    // 4. WE FOUND A COMPLETE OBJECT
                    if (openBraces === 0 && startIndex !== -1) {
                        // Extract the complete JSON string from the buffer
                        const jsonString = this.buffer.substring(startIndex, i + 1);
                        
                        try {
                            const parsedData = JSON.parse(jsonString);
                            this.onValidObject(parsedData); // Pass it to the UI!
                        } catch (e) {
                            try {
                                const repairedString = this.repairJson(jsonString);
                                const parsedData = JSON.parse(repairedString);
                                this.onValidObject(parsedData);
                                console.log("[StreamEngine] Successfully repaired hallucinated JSON.");
                            } catch (repairError) {
                                console.error("[StreamEngine] Fatal JSON error:", repairError);
                            }
                        }

                        // Remove the processed object from our buffer
                        this.buffer = this.buffer.substring(i + 1);
                        
                        // Recursively check if there are MORE objects hiding in the remaining buffer
                        this.processBuffer(); 
                        return; 
                    }
                }
            }
        }
    }

    private repairJson(jsonString: string): string {
        let repaired = jsonString
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']');

        // Escape literal line breaks only while inside a JSON string. Newlines
        // outside strings are legal JSON whitespace and must be preserved.
        let result = '';
        let isInsideString = false;
        let escapeNext = false;

        for (const char of repaired) {
            if (escapeNext) {
                result += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                result += char;
                escapeNext = true;
                continue;
            }

            if (char === '"') {
                result += char;
                isInsideString = !isInsideString;
                continue;
            }

            if (isInsideString && char === '\n') {
                result += '\\n';
            } else if (isInsideString && char === '\r') {
                result += '\\r';
            } else {
                result += char;
            }
        }

        return result;
    }
} // End of class
