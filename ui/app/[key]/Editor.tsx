"use client";

import { useMemo } from "react";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";

type Props = {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  /** Cmd/Ctrl+Enter handler. Return true to stop further handling. */
  onSubmit?: () => void;
  /** Cmd/Ctrl+Shift+Enter handler. Return true to stop further handling. */
  onAltSubmit?: () => void;
};

/**
 * Single shared CodeMirror config — markdown highlighting, monospace, theme
 * matching globals.css (transparent background so it inherits the panel
 * surface, accent border on focus is handled by the wrapper div).
 */
export function Editor(props: Props) {
  const extensions = useMemo(() => {
    const base = [
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          backgroundColor: "transparent",
          color: "var(--fg)",
          fontSize: "13px",
        },
        ".cm-content": { fontFamily: "ui-monospace, monospace", padding: "8px 0" },
        ".cm-gutters": {
          backgroundColor: "transparent",
          color: "var(--fg-dim)",
          border: "none",
        },
        ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.02)" },
        ".cm-activeLineGutter": { backgroundColor: "transparent" },
        "&.cm-focused": { outline: "none" },
      }),
    ];

    if (!props.onSubmit && !props.onAltSubmit) return base;

    // Prec.high so our keys win over CM defaults that also bind Ctrl-Enter.
    return [
      ...base,
      Prec.high(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              if (props.onSubmit) {
                props.onSubmit();
                return true;
              }
              return false;
            },
          },
          {
            key: "Mod-Shift-Enter",
            run: () => {
              if (props.onAltSubmit) {
                props.onAltSubmit();
                return true;
              }
              return false;
            },
          },
        ]),
      ),
    ];
  }, [props.onSubmit, props.onAltSubmit]);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        background: "var(--bg)",
        padding: "0 8px",
      }}
    >
      <CodeMirror
        value={props.value}
        onChange={props.onChange}
        readOnly={props.readOnly}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !props.readOnly,
          highlightActiveLineGutter: false,
          autocompletion: false,
          searchKeymap: false,
        }}
        minHeight={props.minHeight ?? "260px"}
        theme="dark"
      />
    </div>
  );
}
