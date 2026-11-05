"""Extract only verified content covers from Safari's UI-saved Web Archives.

Never reads browser profiles, credentials, scripts or private network APIs.
Requires the matching official works export (normalized by import-douyin.mjs).
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import plistlib
import re
from urllib.parse import urlparse


class Element:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return ''.join(c.text() if isinstance(c, Element) else c for c in self.children)

    def find(self, prefix):
        if any(c.startswith(prefix) for c in self.attrs.get('class', '').split()):
            return self
        for child in self.children:
            if isinstance(child, Element):
                result = child.find(prefix)
                if result:
                    return result

    def cards(self):
        if any(c.startswith('video-card-content-') for c in self.attrs.get('class', '').split()):
            yield self
        else:
            for child in self.children:
                if isinstance(child, Element):
                    yield from child.cards()


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        child = Element(tag, attrs)
        self.stack[-1].children.append(child)
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(child)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def normalize(text):
    return re.sub(r'\s+', '', text)


def extract(path, works, output):
    archive = plistlib.loads(path.read_bytes())
    main = archive['WebMainResource']
    location = urlparse(main['WebResourceURL'])
    # Safari retains the initial document URL after the official SPA navigates
    # from home to content management. Actual rendered cards are verified below.
    if location.scheme != 'https' or location.hostname != 'creator.douyin.com' or location.path not in {'/creator-micro/content/manage', '/creator-micro/home'}:
        raise ValueError('Not the official content management page')
    page = Page()
    page.feed(main['WebResourceData'].decode('utf-8'))
    resources = {r.get('WebResourceURL'): r for r in archive.get('WebSubresources', [])}
    results = []
    for card in page.root.cards():
        title, cover = card.find('info-title-text-'), card.find('video-card-cover-')
        if not title or not cover:
            continue
        date = re.search(r'(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2})', card.text())
        if not date:
            continue
        minute = f'{date[1]}-{date[2]}-{date[3]} {date[4]}'
        matches = [w for w in works if normalize(w['title']) == normalize(title.text()) and w['date'][:16] == minute]
        if len(matches) != 1:
            continue
        match = re.search(r'background-image:\s*url\(["\']?(.*?)["\']?\)', cover.attrs.get('style', ''))
        if not match:
            continue
        url = match[1]
        host = urlparse(url)
        if host.scheme != 'https' or not (host.hostname or '').endswith('.douyinpic.com'):
            raise ValueError('Unexpected cover host')
        resource = resources.get(url)
        if not resource:
            continue
        data, mime = resource['WebResourceData'], resource['WebResourceMIMEType']
        valid = (mime == 'image/webp' and data[:4] == b'RIFF' and data[8:12] == b'WEBP') or (mime == 'image/jpeg' and data[:3] == b'\xff\xd8\xff') or (mime == 'image/png' and data[:8] == b'\x89PNG\r\n\x1a\n')
        if not valid or len(data) > 2*1024*1024:
            raise ValueError('Invalid cover image')
        sha = hashlib.sha256(data).hexdigest()
        file = output / sha
        file.write_bytes(data)
        work = matches[0]
        results.append({'item_key': work['date'].strip()+'|'+work['title'].strip(), 'title': work['title'].strip(), 'published_at': work['date'].strip(), 'sha256': sha, 'content_type': mime, 'path': str(file), 'source': 'https://creator.douyin.com/creator-micro/content/manage', 'observed_at': int(path.stat().st_mtime*1000)})
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--works', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('archives', type=Path, nargs='+')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    works = json.loads(args.works.read_text())
    matches = {}
    for path in args.archives:
        for item in extract(path, works, args.output):
            matches[item['item_key']] = item
    (args.output/'covers.json').write_text(json.dumps(list(matches.values()), ensure_ascii=False))
    print(json.dumps({'matched_covers': len(matches), 'image_bytes': sum(Path(i['path']).stat().st_size for i in matches.values())}))


if __name__ == '__main__':
    main()
