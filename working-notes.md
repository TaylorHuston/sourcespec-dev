# Working Notes

This is an unstructured dumping ground for any notes I want to take as I am developing and testing this standard. Treat this as a combination developer log and informal changelog.

<br />

9-28-26

- Prototyping quickly with the help of Codex.
- Testing with a basic todo app.
- At the moment the ids for things like functions/etc in the catalog are somewhat arbitrary. The LLM is just choosing them based on the function's responsibility. There is no deterministic or programmatic method. This is because there could be multiple functions with the same name or functions could be renamed and/or moved, so the ID should be stable _as long as the function's responsibility remains the same_. Whether this scales or not is something that should be addressed.
- Originally started with calling a path through the application a "flow" but that implied some level of an actual documented execution flow, which is not the level I am trying to document (yet) since that can get tricky to parse in a definitive order. Changed to the terminology "behavior" as that's a bit more forgiving and flexible. Right now the intended scope/purpose of a "behavior" is to describe an intended application behavior and serve as a map of where to start looking for when that behavior isn't working as intended or needs to be updated. It's not trying to create some kind of proto directed acyclice function graph. Something like that could be useful, but maybe as an actual graph DB not something expressed in YAML. Future consideration.
- One thing that I'm still thinking about is the best way to handle anonymous/unnamed functions. It's easy enough for named functions, just note which file it resides in and then the user or LLM can just ctrl+f in that file. The LLM originally suggested using IDs derived from the actual line/column in the file itself, but that sounds like a maintenance nightmare.
- LLM took it upon itself to write a function-catalog generator script, which is helpful but I wanted to focus more on testing the concept before I worried about programatic generation, no harm no foul though I guess.
