# pi-learn

Learn with Pi, practise exam questions, and keep clear notes you can revise later.

pi-learn helps Pi teach you one step at a time, using simple explanations, useful diagrams, comparison tables and memory aids. It saves your lessons as notes you can open in Obsidian.

## Start here

If pi-learn is already installed, open Pi and type:

```text
/pi-teach Fundamental Rights and Directive Principles
```

Replace the topic with anything you want to learn. If the command is missing after installation, type `/reload` or restart Pi.

Need to install it first? Follow the [setup instructions](docs/technical-guide.md#start-learning).

You can speak naturally during a lesson:

- “Explain that more simply, with an everyday example.”
- “Show me a diagram of how these ideas connect.”
- “Ask me one MCQ at a time and wait for my answer.”
- “Help me understand why my answer was wrong.”
- “Make a short revision summary of what we covered.”

## Prepare for your exam

Tell Pi which exam and post you are preparing for. Share the official syllabus and any previous-year questions (PYQs) you have. For example:

> I am preparing for [exam and post]. Here are my syllabus and previous-year papers. Help me decide what to study first, then teach me one topic at a time. Match the questions to my exam's level and explain my mistakes.

You do not need to prepare special data files yourself—ask Pi to help organise your material.

General Studies and General English can require different depth in different exams. The tutor should use your exam's syllabus and papers to judge that depth. Group A–D and gazetted status provide context, but do not determine difficulty on their own.

You can start learning without past papers. Study priorities become better informed as you provide more material; pi-learn does not include a complete question library or predict what will appear in an exam.

## Four useful commands

| Type this in Pi | What it does |
| --- | --- |
| `/pi-teach your topic` | Start learning a topic, or return to it |
| `/md-view` | Open your current lesson note in Obsidian |
| `/learn-status` | See your saved progress and how much is due for revision |
| `/learn-review` | Practise concepts due for revision in your current lesson |

Reviews help you check what you remember after some time has passed. Run `/learn-review` when you return to study. It checks the current lesson; it does not send reminders in the background.

## Where are my notes?

If you have one registered Obsidian vault (your notes folder), pi-learn can use it automatically. Otherwise, when no vault is registered, it saves to the `pi-learn` folder inside your home folder's `Documents` folder.

If you have several vaults or want a different folder, see [choose your notes folder](docs/technical-guide.md#notes-and-obsidian).

Use `/md-view` to open your current note. Add your own thoughts in its **Your notes** section; pi-learn manages the lesson sections. Keep the whole lesson folder together when moving or backing up notes, so its pictures and saved progress stay with it.

## Interactive visual companions

Ask Pi to explain a concept with an interactive visual or practice quiz. It can create a standalone HTML page linked from your lesson, with diagrams, reveal controls, and MCQs. Designs adapt to the topic using the bundled frontend-design skill.

Open companions in a browser, or use Obsidian's HTML Viewer plugin with scripts enabled for your trusted lessons. Practice inside a page does not update your saved Pi review status. See [visual setup and verification](docs/technical-guide.md#html-visual-companions).

## See an example

The [sample lesson on Fundamental Rights and Directive Principles](examples/lessons/fundamental-rights-and-directive-principles.md) shows the teaching style: a clear diagram, comparison tables, a memory aid and practice questions.

For installation, older notes, recovery or developer information, use the [setup and technical guide](docs/technical-guide.md).
