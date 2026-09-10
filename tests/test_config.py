import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from live_life.config import load_config


class SourceConfigTest(TestCase):
    def test_portable_env_setup_and_shell_precedence(self):
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'config.toml').write_text(
                '[general]\ntimezone="UTC"\nday_boundary_hour=5\n'
                'database="data/life.db"\nreports="reports"\n')
            (root / '.env').write_text(
                'TODOIST_API_TOKEN=example-test-token\n'
                'TODOIST_API_BASE_URL=https://example.invalid/api/\n'
                'RESCUETIME_API_URL=https://example.invalid/data\n'
                'WELLTORY_DOWNLOADS_DIR=exports\n'
                'WELLTORY_FILE_PATTERN=custom*.csv\n'
                'SOURCE_INBOX_DIR=incoming\n'
                'GOOGLE_DRIVE_CACHE_DIR=cache\n'
                'GOOGLE_DRIVE_CLIENT_SECRET_FILE=private/client.json\n'
                'GOOGLE_DRIVE_TOKEN_FILE=~/test-token.json\n'
                'GOOGLE_DRIVE_FOLDER_ID=test-folder\n'
                'DIARY_GOOGLE_DOC_ID=test-doc\n')
            with patch.dict(os.environ, {'TODOIST_API_TOKEN': 'shell-token'}, clear=True):
                config = load_config(root)
                self.assertEqual(os.environ[config.todoist_token_env], 'shell-token')
                self.assertEqual(config.todoist_api_base_url, 'https://example.invalid/api')
                self.assertEqual(config.rescuetime_api_url, 'https://example.invalid/data')
                self.assertEqual(config.welltory_downloads, root / 'exports')
                self.assertEqual(config.welltory_pattern, 'custom*.csv')
                self.assertEqual(config.inbox, root / 'incoming')
                self.assertEqual(config.fitness_drive_cache, root / 'cache')
                self.assertEqual(config.fitness_drive_client_secret, root / 'private/client.json')
                self.assertEqual(config.fitness_drive_token, Path('~/test-token.json').expanduser())
                self.assertEqual(config.fitness_drive_folder_id, 'test-folder')
                self.assertEqual(config.diary_google_doc_id, 'test-doc')
