import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('covers', Path(__file__).resolve().parents[1]/'scripts/extract-douyin-covers.py')
covers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(covers)


class CoversTest(unittest.TestCase):
    def test_exact_title_and_date_required_with_resource_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            archive = output/'page.webarchive'
            url = 'https://p1.douyinpic.com/test.webp'
            html = f'<div class="video-card-content-test"><div class="video-card-cover-test" style="background-image: url(&quot;{url}&quot;)"></div><div class="info-title-text-test">医院 CT 机</div><span>2026年11月04日 20:00</span></div>'
            page = {'WebMainResource': {'WebResourceURL': 'https://creator.douyin.com/creator-micro/content/manage', 'WebResourceData': html.encode()}, 'WebSubresources': [{'WebResourceURL':url, 'WebResourceMIMEType':'image/webp', 'WebResourceData':b'RIFF1234WEBPtest'}]}
            archive.write_bytes(plistlib.dumps(page))
            work = {'title':'医院CT机 ', 'date':'2026-11-04 20:00:00'}
            result = covers.extract(archive,[work],output)
            self.assertEqual(len(result),1)
            self.assertEqual(result[0]['item_key'],work['date']+'|'+work['title'].strip())
            page['WebMainResource']['WebResourceURL'] = 'https://creator.douyin.com/creator-micro/home'
            archive.write_bytes(plistlib.dumps(page))
            self.assertEqual(len(covers.extract(archive,[work],output)),1)
            self.assertEqual(covers.extract(archive,[{**work,'date':'2026-11-03 20:00:00'}],output),[])
            self.assertEqual(covers.extract(archive,[work,work],output),[])
            page['WebSubresources'] = []
            archive.write_bytes(plistlib.dumps(page))
            self.assertEqual(covers.extract(archive,[work],output),[])

    def test_unrelated_saved_page_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder)/'page.webarchive'
            archive.write_bytes(plistlib.dumps({'WebMainResource': {'WebResourceURL':'https://example.com', 'WebResourceData':b''}}))
            with self.assertRaises(ValueError):
                covers.extract(archive,[],Path(folder))


if __name__ == '__main__':
    unittest.main()
