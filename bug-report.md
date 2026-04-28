# Bug: prompts are getting worse instead of better

I've been running better-prompts on a customer support classifier for about three weeks. The first couple of weeks it was great — I'd thumbs-down the bad outputs, run evolve every few days, and the next revision would clearly fix the things I'd flagged.

It stopped working sometime last week. I'm still flagging fails on the bad outputs. I'm still running evolve. But the new revisions don't fix what I'm flagging anymore. Some of them are actively worse than what I had before.

Three things I've noticed:

1. The revisions evolve produces feel like they're solving problems I had two weeks ago, not the problems I'm flagging now.
2. It got worse around the time the artifact crossed maybe 30 invocations on the current revision. I don't have an exact number.
3. If I rollback and start fresh, evolve works correctly again on the new revision — until that revision accumulates enough traffic, and then the same thing happens.

This is a pretty bad failure mode for me because the whole reason I'm using better-prompts is the evolve loop. If evolve stops responding to recent feedback once I have actual production volume, it's worse than just hand-editing the prompts.
