import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function askMcqExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_mcq",
    label: "Ask MCQ",
    description:
      "Ask the learner an interactive multiple-choice question in the terminal TUI during probing or step-by-step teaching. Returns the chosen answer.",
    parameters: Type.Object({
      question: Type.String({ description: "The question text to ask the learner." }),
      options: Type.Array(Type.String(), {
        description: "List of options (e.g. ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4']).",
      }),
      context: Type.Optional(
        Type.String({ description: "Optional context or node name (e.g. 'Prerequisite Probe: Line Integrals' or 'Node 2: Covector Fields')." })
      ),
      allowCustomResponse: Type.Optional(
        Type.Boolean({ description: "Whether to allow user to type a custom response or choose 'I don't know' (default: true)." })
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: `[Non-TUI Mode] Question: ${params.question}\nOptions:\n${params.options.join("\n")}`,
            },
          ],
        };
      }

      const header = params.context ? `🧠 [${params.context}]\n\n${params.question}` : params.question;
      const choices = [...params.options];

      const allowCustom = params.allowCustomResponse !== false;
      if (allowCustom) {
        choices.push("🤷 I don't know / Explain this", "💬 Type a custom answer / note");
      }

      const selected = await ctx.ui.select(header, choices);

      if (!selected) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "cancelled",
                selectedOption: null,
                message: "Learner dismissed or cancelled the question.",
              }),
            },
          ],
        };
      }

      if (selected === "💬 Type a custom answer / note") {
        const customText = await ctx.ui.input("Enter your explanation, reasoning, or answer:");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "custom_input",
                selectedOption: "Custom Answer",
                customInput: customText || "(no input provided)",
              }),
            },
          ],
        };
      }

      if (selected === "🤷 I don't know / Explain this") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "dont_know",
                selectedOption: "I don't know / Explain this",
                learnerKnowledge: "uncertain_or_gap",
              }),
            },
          ],
        };
      }

      const selectedIndex = params.options.indexOf(selected);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "answered",
              selectedOption: selected,
              optionIndex: selectedIndex >= 0 ? selectedIndex : null,
            }),
          },
        ],
      };
    },
  });
}
