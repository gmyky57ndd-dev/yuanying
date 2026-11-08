#!/usr/bin/env python3
"""ES-079: parser tests for kb_collect (DeepSeek + ChatGPT shapes)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kb_collect as kc  # noqa: E402


class CollectorParsing(unittest.TestCase):
    def test_deepseek_messages_list(self):
        data = [
            {
                "title": "部署讨论",
                "messages": [
                    {"role": "user", "content": "部署到哪？"},
                    {"role": "assistant", "content": "Coolify。"},
                ],
            }
        ]
        convs = kc.extract_conversations(data, "x.json")
        self.assertEqual(len(convs), 1)
        title, messages = convs[0]
        self.assertEqual(title, "部署讨论")
        self.assertEqual(messages[0], ("user", "部署到哪？"))
        md = kc.to_markdown(title, messages)
        self.assertIn("**我**：部署到哪？", md)
        self.assertIn("**AI**：Coolify。", md)

    def test_chatgpt_mapping_tree(self):
        data = [
            {
                "title": "ChatGPT mapping",
                "mapping": {
                    "root": {"id": "root", "parent": None, "message": None},
                    "u1": {
                        "id": "u1",
                        "parent": "root",
                        "message": {"author": {"role": "user"}, "content": {"parts": ["你好"]}},
                    },
                    "a1": {
                        "id": "a1",
                        "parent": "u1",
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["你好，我是元婴。"]},
                        },
                    },
                },
            }
        ]
        convs = kc.extract_conversations(data, "chatgpt.json")
        self.assertEqual(len(convs), 1)
        _, messages = convs[0]
        self.assertEqual(messages, [("user", "你好"), ("assistant", "你好，我是元婴。")])

    def test_content_parts_and_dicts(self):
        self.assertEqual(kc.content_text(["a", {"text": "b"}]), "a\nb")
        self.assertEqual(kc.content_text({"content": "c"}), "c")

    def test_title_and_summary_heuristics(self):
        messages = [("user", "第一行用户问题很长很长"), ("assistant", "这是回答摘要")]
        self.assertTrue(kc.conversation_title({}, messages).startswith("第一行用户问题"))
        self.assertEqual(kc.conversation_summary(messages), "这是回答摘要")


if __name__ == "__main__":
    unittest.main(verbosity=2)
