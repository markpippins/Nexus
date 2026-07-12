# nexus/python/address/tts — Speech Projection Layer for Conduit Monitoring
#
# Non-invasive TTS subscriber that connects to conduit event streams
# and produces spoken audio output via Piper TTS.
#
# Architecture:
#   Event Stream → Speech Projector → Utterance Queue → TTS Engine → Audio Sink
