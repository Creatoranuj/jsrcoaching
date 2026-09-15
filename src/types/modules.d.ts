/* eslint-disable @typescript-eslint/no-explicit-any -- Ambient module shims for third-party packages that ship no type definitions.
   These declarations intentionally stay permissive: narrowing them here would type-check the shim, not the library. */
declare module '@dnd-kit/core' {
  export type DragEndEvent = any;
  export const DndContext: any;
  export const closestCenter: any;
  export const KeyboardSensor: any;
  export const PointerSensor: any;
  export const TouchSensor: any;
  export const useSensor: any;
  export const useSensors: any;
  export const DragOverlay: any;
}
declare module '@dnd-kit/sortable' {
  export const SortableContext: any;
  export const sortableKeyboardCoordinates: any;
  export const useSortable: any;
  export const verticalListSortingStrategy: any;
  export const arrayMove: any;
  export const horizontalListSortingStrategy: any;
}
declare module '@dnd-kit/utilities' {
  export const CSS: any;
}
declare module 'react-markdown' {
  const ReactMarkdown: any;
  export default ReactMarkdown;
}
declare module 'remark-gfm' {
  const remarkGfm: any;
  export default remarkGfm;
}
declare module 'dompurify' {
  const DOMPurify: any;
  export default DOMPurify;
}
declare module '@uiw/react-md-editor' {
  const MDEditor: React.FC<any>;
  export default MDEditor;
  export const commands: any;
}
declare module 'react-player/youtube' {
  class ReactPlayer extends React.Component<any, any> {
    seekTo(amount: number, type?: string): void;
    getCurrentTime(): number;
    getDuration(): number;
    getInternalPlayer(): any;
  }
  export default ReactPlayer;
}
declare module '@capacitor/app' {
  export const App: any;
}
declare module '@capacitor/filesystem' {
  export const Filesystem: any;
  export const Directory: any;
  export const Encoding: any;
}
