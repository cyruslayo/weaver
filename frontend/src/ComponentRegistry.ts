// This is the shape of the function you will write in your actual app
export type ComponentRenderer = (
    componentData: any, 
    builtChildren: HTMLElement[]
) => HTMLElement | null;

// This represents the flat dictionary of all components currently on screen
export type ComponentStore = Record<string, any>;

export class ComponentRegistry {
    // Our secure dictionary mapping names (like 'Card') to functions
    private renderers: Map<string, ComponentRenderer> = new Map();

    /**
     * THE DEVELOPER API: 
     * Use this to teach the kit how to draw specific components.
     */
    public register(componentName: string, renderer: ComponentRenderer) {
        this.renderers.set(componentName, renderer);
    }

    /**
     * THE INTERNAL ENGINE: 
     * Transforms a flat A2UI component ID into a real HTML tree.
     */
    public buildNode(componentId: string, flatStore: ComponentStore): HTMLElement | null {
        const compNode = flatStore[componentId];
        if (!compNode) return null; // Component hasn't streamed in yet

        // In A2UI, the key is the component name (e.g., { "Card": { ... } })
        const componentName = Object.keys(compNode)[0]; 
        const componentData = compNode[componentName];

        // 1. THE ZERO-TRUST FIREWALL
        const renderer = this.renderers.get(componentName);
        if (!renderer) {
            console.warn(`[A2Kit Security] Blocked unregistered component: ${componentName}`);
            return null; // The AI hallucinates, the kit ignores.
        }

        // 2. RECURSIVE RESOLUTION
        const builtChildren: HTMLElement[] = [];
        
        // If the AI specified children, we build them first
        if (componentData.children && Array.isArray(componentData.children)) {
            componentData.children.forEach((childId: string) => {
                const childElement = this.buildNode(childId, flatStore);
                if (childElement) {
                    builtChildren.push(childElement);
                }
            });
        }

        // 3. EXECUTE THE RENDERER
        // We pass the data and the fully assembled children to your custom function
        return renderer(componentData, builtChildren);
    }
} // End of class