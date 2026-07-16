import unittest

from transcription_quality import build_second_pass_prompt, choose_transcript, clean_transcript


class TranscriptionQualityTests(unittest.TestCase):
    def test_removes_pathological_repetition(self):
        self.assertEqual(clean_transcript("Love\nLove\nLove\nFire"), "Love\nLove\nFire")

    def test_context_prompt_contains_identity_and_first_listening(self):
        prompt = build_second_pass_prompt("Ganja Love", "Iyari Gomez", "under the moonlight")
        self.assertIn("Ganja Love", prompt)
        self.assertIn("moonlight", prompt)
        self.assertNotIn("First listening draft", prompt)

    def test_contextual_second_pass_wins_close_score(self):
        first = {"text": "ganja low under tree", "segments": [{"avg_logprob": -0.3}]}
        second = {"text": "ganja love under sacred trees", "segments": [{"avg_logprob": -0.31}]}
        result = choose_transcript(first, second)
        self.assertEqual(result["selected"], "second")
        self.assertIn("ganja love", result["text"])

    def test_first_pass_survives_low_confidence_second_pass(self):
        first = {"text": "clear original lyric", "segments": [{"avg_logprob": -0.1}]}
        second = {"text": "uncertain hallucinated output", "segments": [{"avg_logprob": -1.4}]}
        self.assertEqual(choose_transcript(first, second)["selected"], "first")


if __name__ == "__main__":
    unittest.main()
