# Working Notes

This is an unstructured dumping ground for any notes I want to take as I am developing and testing this standard. Treat this as a combination developer log and informal changelog.

9-29-26

- Still thinking about framing. The purpose behind this spec is help developers find out where exactly everything in the codebase _is_. It's similar to what I was trying to accomplish with my Story Driven Development process, that also had it's own version of "implemented by" and "verified by." I don't want this spec to only be something that can be used with SDD, but I do want it to be something that meshes well with it.&#x20;
- As I see it there are kind of two base, fundamental questions that need to be answered about any codebase, especially one you're unfamiliar with.
  - What's actually been implemented?
  - Where is the code that actully handles that implementation?

- I've been dropped into codebases that were such an undocumented mess that I didn't even know everything the app was _supposed_ to do, let alone where to look if something was broken. And there's been cases were some functionality was mentioned in a Confluence page or Google Doc, but no way to know for sure if it was ever actually implemented, or if it was but then later removed, etc.
- So there are two questions that need answered, and I see this as two complimentary tools to answer them.
  - The YAML spec files, which are easily programatically generated and verified, should answer the "where does a given implementation exist?"
  - The markdown stories should answer the "what functionality has actually been implemented?"

- To that end I am thinking I am going to reframe, again, from "behaviors" to "requirements." The resulting YAML files are essentially the same, but treating them like requirements bridges the gap between the two. A requirement is still a way of representing a flow or behavior through the app, something like new user creation, etc, by mapping it to the actual functions in the code. And a story should be broken down into concrete requirements, so they can just reference the requirement YAML files directly.
- Both could still be used indepentantly. You could have all of the YAML specs as is as an implementation map, and track what user facing functionality has been developed in some other way. And you could still use stories, but just write the requirements in the markdown files directly, similar to what my existing SDD workflow does. In theory at least, I've only been working on this for about 48 hours and have not stress tested it on a real codebase yet.

9-28-26

- Prototyping quickly with the help of Codex.
- Testing with a basic todo app.
- At the moment the ids for things like functions/etc in the catalog are somewhat arbitrary. The LLM is just choosing them based on the function's responsibility. There is no deterministic or programmatic method. This is because there could be multiple functions with the same name or functions could be renamed and/or moved, so the ID should be stable _as long as the function's responsibility remains the same_. Whether this scales or not is something that should be addressed.
- Originally started with calling a path through the application a "flow" but that implied some level of an actual documented execution flow, which is not the level I am trying to document (yet) since that can get tricky to parse in a definitive order. Changed to the terminology "behavior" as that's a bit more forgiving and flexible. Right now the intended scope/purpose of a "behavior" is to describe an intended application behavior and serve as a map of where to start looking for when that behavior isn't working as intended or needs to be updated. It's not trying to create some kind of proto directed acyclice function graph. Something like that could be useful, but maybe as an actual graph DB not something expressed in YAML. Future consideration.
- One thing that I'm still thinking about is the best way to handle anonymous/unnamed functions. It's easy enough for named functions, just note which file it resides in and then the user or LLM can just ctrl+f in that file. The LLM originally suggested using IDs derived from the actual line/column in the file itself, but that sounds like a maintenance nightmare.
- LLM took it upon itself to write a function-catalog generator script, which is helpful but I wanted to focus more on testing the concept before I worried about programatic generation, no harm no foul though I guess.
