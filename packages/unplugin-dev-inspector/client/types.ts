// Type Definitions
export interface InspectedElement {
  file: string;
  component: string;
  apis: string[];
  line: number;
  column: number;
  element?: Element;
  elementInfo?: {
    tagName: string;
    textContent: string;
    className: string;
    id: string;
    attributes: Record<string, string>;
    // Legacy flat styles for backwards compatibility
    styles: Record<string, string>;
    // Enhanced metadata
    domPath: string; // e.g., "html > body > div#app > header > nav"
    boundingBox: {
      top: number;
      left: number;
      width: number;
      height: number;
      right: number;
      bottom: number;
      x: number;
      y: number;
    };
    lineRange?: {
      start: number;
      end: number;
    };
    // Categorized computed styles for better organization
    computedStyles: {
      layout: {
        display: string;
        position: string;
        width: string;
        height: string;
        overflow: string;
        overflowX: string;
        overflowY: string;
        float: string;
        clear: string;
        zIndex: string;
      };
      typography: {
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        fontStyle: string;
        lineHeight: string;
        textAlign: string;
        textDecoration: string;
        textTransform: string;
        letterSpacing: string;
        wordSpacing: string;
        color: string;
      };
      spacing: {
        padding: string;
        paddingTop: string;
        paddingRight: string;
        paddingBottom: string;
        paddingLeft: string;
        margin: string;
        marginTop: string;
        marginRight: string;
        marginBottom: string;
        marginLeft: string;
      };
      background: {
        backgroundColor: string;
        backgroundImage: string;
        backgroundSize: string;
        backgroundPosition: string;
        backgroundRepeat: string;
      };
      border: {
        border: string;
        borderTop: string;
        borderRight: string;
        borderBottom: string;
        borderLeft: string;
        borderRadius: string;
        borderColor: string;
        borderWidth: string;
        borderStyle: string;
      };
      effects: {
        opacity: string;
        visibility: string;
        boxShadow: string;
        textShadow: string;
        filter: string;
        transform: string;
        transition: string;
        animation: string;
      };
      flexbox: {
        flexDirection: string;
        flexWrap: string;
        justifyContent: string;
        alignItems: string;
        alignContent: string;
        flex: string;
        flexGrow: string;
        flexShrink: string;
        flexBasis: string;
        order: string;
      };
      grid: {
        gridTemplateColumns: string;
        gridTemplateRows: string;
        gridTemplateAreas: string;
        gridGap: string;
        gridColumnGap: string;
        gridRowGap: string;
        gridAutoFlow: string;
        gridAutoColumns: string;
        gridAutoRows: string;
      };
    };
  };
  automated?: boolean;
  /** Found related elements when doing a region inspection (lighter versions without heavy styles) */
  relatedElements?: InspectedElement[];
}

export interface ReactFiber {
  type?: any;
  _owner?: ReactFiber;
  return?: ReactFiber;
  [key: string]: any;
}

export interface EnhancedNetworkRequest {
  id: string;
  url: string;
  method: string;
  type: "fetch" | "xhr";
  timestamp: number;
  duration?: number;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  responseType?: string;
  error?: string;
  size?: number;
  initiator?: string;
}

// Context data types for MCP chrome_devtools
export interface ConsoleMessage {
  msgid: number;
  level: string;
  text: string;
  timestamp?: number;
}

export interface NetworkRequest {
  reqid: number;
  method: string;
  url: string;
  status: string;
  timestamp?: number;
}

export interface StdioMessage {
  stdioid: number;
  stream: "stdout" | "stderr";
  data: string;
  timestamp?: number;
}
