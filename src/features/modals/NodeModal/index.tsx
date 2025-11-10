import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setJson = useJson(state => state.setJson);
  const getJson = useJson(state => state.getJson);

  const setSelectedNode = useGraph(state => state.setSelectedNode);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("{}");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // reset draft and editing when node changes
    setEditing(false);
    setError(null);
    setDraft(normalizeNodeData(nodeData?.text ?? []));
  }, [nodeData?.id]);

  const handleEdit = () => {
    setDraft(normalizeNodeData(nodeData?.text ?? []));
    setEditing(true);
    setError(null);
  };

  const setValueAtPath = (obj: any, path: NodeData["path"] | undefined, value: any) => {
    if (!path || path.length === 0) {
      // root
      return value;
    }

    let target = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i] as any;
      if (typeof seg === "number") {
        if (!Array.isArray(target[seg])) target[seg] = [];
        target = target[seg];
      } else {
        if (typeof target[seg] !== "object" || target[seg] === null) target[seg] = {};
        target = target[seg];
      }
    }

    const last = path[path.length - 1] as any;
    if (typeof last === "number") {
      target[last] = value;
    } else {
      target[last] = value;
    }

    return obj;
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(draft);

      const originalJson = getJson();
      let originalObj: any;
      try {
        originalObj = JSON.parse(originalJson);
      } catch (e) {
        // if original JSON is somehow invalid, replace entire
        originalObj = parsed;
      }

      // if the node is a singular value (no key), the path points directly to the value
      if (nodeData && nodeData.text.length === 1 && !nodeData.text[0].key) {
        // replace value at path
        const newObj = setValueAtPath(originalObj, nodeData.path, parsed);
        setJson(JSON.stringify(newObj, null, 2));
      } else if (nodeData && nodeData.path) {
        // node represents an object; merge primitive keys provided in parsed into the object at path
        // navigate to the object at path
        let target = originalObj;
        for (let i = 0; i < nodeData.path.length; i++) {
          const seg = nodeData.path[i] as any;
          target = target?.[seg];
          if (typeof target === "undefined") break;
        }

        if (typeof target === "object" && target !== null) {
          Object.keys(parsed).forEach(key => {
            target[key] = parsed[key];
          });

          // set the updated object back into originalObj
          const newObj = setValueAtPath(originalObj, nodeData.path, target);
          setJson(JSON.stringify(newObj, null, 2));
        } else {
          // fallback: set at path directly
          const newObj = setValueAtPath(originalObj, nodeData.path, parsed);
          setJson(JSON.stringify(newObj, null, 2));
        }
      } else {
        // fallback: replace the entire JSON
        setJson(JSON.stringify(parsed, null, 2));
      }

      // re-select node by path after graph rebuild
      const pathStr = JSON.stringify(nodeData?.path ?? []);
      const found = useGraph.getState().nodes.find(n => JSON.stringify(n.path ?? []) === pathStr);
      if (found) setSelectedNode(found);

      setEditing(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Invalid JSON");
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(normalizeNodeData(nodeData?.text ?? []));
    setError(null);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {!editing ? (
                <Button size="xs" variant="light" onClick={handleEdit}>
                  Edit
                </Button>
              ) : (
                <>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="subtle" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!editing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                autosize
                minRows={6}
                maxRows={20}
                value={draft}
                onChange={e => setDraft(e.currentTarget.value)}
                styles={{ input: { fontFamily: "monospace" } }}
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
        {error ? (
          <Text color="red" fz="xs">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Modal>
  );
};
