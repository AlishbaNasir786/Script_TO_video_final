export const demoResult = {
  success: true,
  genre: "Romance",
  tone: "Emotional",
  characters: [
    {
      name: "SARA",
      role: "Protagonist",
      age: "25",
      gender: "Female",
      appearance: "A strikingly beautiful young woman with long black hair that falls in waves past her shoulders, warm brown eyes that reflect both joy and sorrow, olive skin, and a graceful slender build. Her face carries a quiet strength beneath its softness.",
      clothing: "A flowing red dress that contrasts against the grey rain of Istanbul, a worn beige trench coat she clutches tightly, and simple black heels.",
      personality: "Deeply intuitive, passionate, and fiercely independent. Sara loves with her whole heart but guards it carefully after past pain. She is perceptive enough to sense when something is hidden from her.",
      emotion: "longing"
    },
    {
      name: "KARIM",
      role: "Love Interest",
      age: "30",
      gender: "Male",
      appearance: "Tall and lean with sharp dark eyes that hold an entire world of secrets. His jawline is strong, his expression composed but rarely fully relaxed. A faint scar runs along his left temple — never explained, never forgotten.",
      clothing: "A weathered black leather jacket over a dark shirt, dark trousers, and boots built for walking — always looking as if he might leave at any moment.",
      personality: "Magnetic, guarded, and deeply loyal beneath layers of caution. Karim carries guilt like a second skin. He falls in love reluctantly, then completely.",
      emotion: "mysterious"
    }
  ],
  screenplay: `FADE IN:

INT. ISTANBUL TRAIN STATION — NIGHT

Rain hammers the glass roof of Sirkeci Station. Steam rises from the tracks. The platform is nearly empty — just stragglers and shadows.

SARA stands alone, red dress visible beneath her open coat, staring at the departure board. Her train is delayed. Two hours. She closes her eyes.

A FIGURE steps beside her. She doesn't look up.

KARIM
(quietly)
Istanbul never lets you leave on time.

SARA
(not looking at him)
Maybe it just doesn't want to be left.

A beat. She turns. Their eyes meet for the first time.

KARIM
(studying her)
You're not afraid of it. The waiting.

SARA
I've had practice.

[EMOTION: guarded]

CUT TO:

INT. STATION CAFÉ — LATER

They sit across from each other, two cups of tea between them. The rain continues outside. The world has narrowed to this table.

KARIM
You live here? In Istanbul?

SARA
I came back. A year ago. After my mother died.

(pause)

I thought being somewhere familiar would feel like home again.

KARIM
(softly)
Did it?

SARA
(looking at him directly)
Not until tonight.

[EMOTION: longing]

KARIM looks away. Something flickers across his face — want and warning at once.

KARIM
You shouldn't say things like that to strangers.

SARA
You stopped being a stranger when you sat down.

[EMOTION: romantic]

CUT TO:

EXT. ISTANBUL STREETS — CONTINUOUS

They walk through narrow cobblestoned streets. Rain has softened to mist. Their shoulders almost touch.

SARA
Where are you going? When the train leaves.

KARIM
(a pause too long)
Somewhere I have to go.

SARA
That's not an answer.

KARIM
No. It isn't.

[EMOTION: tense]

Sara stops walking. She faces him.

SARA
Are you running away from something?

KARIM
(meeting her eyes)
Aren't we all?

SARA
Not me. Not anymore.

[EMOTION: fierce]

CUT TO:

INT. TRAIN STATION — PLATFORM — DAWN

Hours have passed. The platform is empty. Their train departure board flickers.

They stand close, the space between them charged.

KARIM
I have to tell you something.

SARA
(quietly)
I know.

KARIM
You don't. You can't.

SARA
Then tell me.

A long silence. Karim looks at her — really looks at her — as if memorizing something he fears losing.

KARIM
(barely above a whisper)
Three years ago, I made a decision that hurt people I loved. I've been paying for it since. Moving. Disappearing. Staying invisible.

(voice breaking)

I don't know how to stop.

[EMOTION: vulnerable]

Sara reaches out. Her hand finds his.

SARA
Then stop.

[EMOTION: tender]

CUT TO:

INT. TRAIN STATION — MOMENTS LATER

KARIM
If you knew everything — you'd walk away.

SARA
(firmly)
You don't get to decide that for me.

KARIM
Sara—

SARA
Tell me everything. And let me choose.

[EMOTION: determined]

Karim searches her face. He finds no judgment there — only courage.

KARIM
(a long exhale)
My name isn't Karim. It wasn't, when it happened.

Sara doesn't flinch. She holds his gaze.

SARA
Then tell me your real name.

[EMOTION: open]

CUT TO:

EXT. ISTANBUL — BOSPHORUS BRIDGE — SUNRISE

They stand at the railing. The city breathes below them. The water catches the first light.

He has told her everything. The silence that follows is not empty — it is full.

SARA
(finally)
You've been punishing yourself for three years for a mistake you made trying to protect someone you loved.

KARIM
People were hurt.

SARA
And you've been hurting ever since. Does that fix anything?

[EMOTION: searching]

KARIM
(raw)
I don't know how to forgive myself.

SARA
(turning to face him)
Then maybe that's what I'm here for.

[EMOTION: love]

Karim looks at her. Something in him — something long locked — begins to open.

KARIM
You barely know me.

SARA
I know enough.

(pause)

I know you sat beside a stranger in a train station and told her the sky doesn't let you leave.

KARIM
(almost smiling)
I said Istanbul doesn't let you leave.

SARA
Same thing.

[EMOTION: tender]

They stand together as the sun rises over Istanbul, the city enormous and ancient around them.

FADE OUT.`,

  scenes: [
    {
      id: 1,
      heading: "INT. ISTANBUL TRAIN STATION — NIGHT",
      location: "ISTANBUL TRAIN STATION",
      timeOfDay: "NIGHT",
      emotion: "mysterious",
      action: "Rain hammers the glass roof of Sirkeci Station. Steam rises from the tracks. The platform is nearly empty — just stragglers and shadows. Sara stands alone, staring at the departure board.",
      dialogue: [
        { character: "KARIM", text: "Istanbul never lets you leave on time.", emotion: "mysterious", parenthetical: "quietly" },
        { character: "SARA", text: "Maybe it just doesn't want to be left.", emotion: "guarded", parenthetical: "" },
        { character: "KARIM", text: "You're not afraid of it. The waiting.", emotion: "curious", parenthetical: "studying her" },
        { character: "SARA", text: "I've had practice.", emotion: "guarded", parenthetical: "" }
      ]
    },
    {
      id: 2,
      heading: "INT. STATION CAFÉ — LATER",
      location: "STATION CAFÉ",
      timeOfDay: "NIGHT",
      emotion: "romantic",
      action: "They sit across from each other, two cups of tea between them. The rain continues outside. The world has narrowed to this table.",
      dialogue: [
        { character: "KARIM", text: "You live here? In Istanbul?", emotion: "curious", parenthetical: "" },
        { character: "SARA", text: "I came back. A year ago. After my mother died. I thought being somewhere familiar would feel like home again.", emotion: "sad", parenthetical: "" },
        { character: "KARIM", text: "Did it?", emotion: "gentle", parenthetical: "softly" },
        { character: "SARA", text: "Not until tonight.", emotion: "longing", parenthetical: "looking at him directly" },
        { character: "KARIM", text: "You shouldn't say things like that to strangers.", emotion: "guarded", parenthetical: "" },
        { character: "SARA", text: "You stopped being a stranger when you sat down.", emotion: "romantic", parenthetical: "" }
      ]
    },
    {
      id: 3,
      heading: "EXT. ISTANBUL STREETS — CONTINUOUS",
      location: "ISTANBUL STREETS",
      timeOfDay: "NIGHT",
      emotion: "tense",
      action: "They walk through narrow cobblestoned streets. Rain has softened to mist. Their shoulders almost touch.",
      dialogue: [
        { character: "SARA", text: "Where are you going? When the train leaves.", emotion: "curious", parenthetical: "" },
        { character: "KARIM", text: "Somewhere I have to go.", emotion: "evasive", parenthetical: "a pause too long" },
        { character: "SARA", text: "That's not an answer.", emotion: "sharp", parenthetical: "" },
        { character: "SARA", text: "Are you running away from something?", emotion: "searching", parenthetical: "" },
        { character: "KARIM", text: "Aren't we all?", emotion: "tense", parenthetical: "meeting her eyes" },
        { character: "SARA", text: "Not me. Not anymore.", emotion: "fierce", parenthetical: "" }
      ]
    },
    {
      id: 4,
      heading: "INT. TRAIN STATION — PLATFORM — DAWN",
      location: "TRAIN STATION PLATFORM",
      timeOfDay: "DAWN",
      emotion: "vulnerable",
      action: "Hours have passed. The platform is empty. Their train departure board flickers. They stand close, the space between them charged.",
      dialogue: [
        { character: "KARIM", text: "I have to tell you something.", emotion: "serious", parenthetical: "" },
        { character: "SARA", text: "I know.", emotion: "calm", parenthetical: "quietly" },
        { character: "KARIM", text: "Three years ago, I made a decision that hurt people I loved. I've been paying for it since. Moving. Disappearing. Staying invisible. I don't know how to stop.", emotion: "vulnerable", parenthetical: "voice breaking" },
        { character: "SARA", text: "Then stop.", emotion: "tender", parenthetical: "" },
        { character: "KARIM", text: "If you knew everything — you'd walk away.", emotion: "fearful", parenthetical: "" },
        { character: "SARA", text: "You don't get to decide that for me.", emotion: "fierce", parenthetical: "firmly" },
        { character: "SARA", text: "Tell me everything. And let me choose.", emotion: "determined", parenthetical: "" }
      ]
    },
    {
      id: 5,
      heading: "EXT. ISTANBUL — BOSPHORUS BRIDGE — SUNRISE",
      location: "BOSPHORUS BRIDGE",
      timeOfDay: "SUNRISE",
      emotion: "hopeful",
      action: "They stand at the railing. The city breathes below them. The water catches the first light. He has told her everything.",
      dialogue: [
        { character: "SARA", text: "You've been punishing yourself for three years for a mistake you made trying to protect someone you loved.", emotion: "searching", parenthetical: "" },
        { character: "KARIM", text: "People were hurt.", emotion: "guilty", parenthetical: "" },
        { character: "SARA", text: "And you've been hurting ever since. Does that fix anything?", emotion: "searching", parenthetical: "" },
        { character: "KARIM", text: "I don't know how to forgive myself.", emotion: "raw", parenthetical: "raw" },
        { character: "SARA", text: "Then maybe that's what I'm here for.", emotion: "love", parenthetical: "turning to face him" },
        { character: "KARIM", text: "You barely know me.", emotion: "disbelief", parenthetical: "" },
        { character: "SARA", text: "I know enough. I know you sat beside a stranger in a train station and told her the sky doesn't let you leave.", emotion: "tender", parenthetical: "" },
        { character: "KARIM", text: "I said Istanbul doesn't let you leave.", emotion: "tender", parenthetical: "almost smiling" },
        { character: "SARA", text: "Same thing.", emotion: "love", parenthetical: "" }
      ]
    }
  ]
};