import base64
import math
from io import BytesIO
from PIL import Image, ImageDraw


def signature_image(data):
    encoded = data.get('signature_image')
    if encoded:
        if not isinstance(encoded, str) or not encoded.startswith('data:image/png;base64,') or len(encoded) > 2800000:
            raise ValueError('Upload a transparent PNG signature smaller than 2 MB.')
        try:
            raw = base64.b64decode(encoded.split(',', 1)[1], validate=True)
            image = Image.open(BytesIO(raw))
            if image.format != 'PNG' or image.width * image.height > 4000000:
                raise ValueError()
            image.load()
            image = image.convert('RGBA')
            if image.getchannel('A').getextrema()[0] == 255:
                raise ValueError()
        except Exception:
            raise ValueError('Use a valid PNG with a transparent background (up to 4 million pixels).')
    else:
        strokes = data.get('signature_strokes')
        if not isinstance(strokes, list) or not 1 <= len(strokes) <= 100:
            raise ValueError('Draw or upload your signature.')
        image = Image.new('RGBA', (1200, 400), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        total = 0
        for stroke in strokes:
            if not isinstance(stroke, list) or len(stroke) < 2:
                raise ValueError('Draw a complete signature.')
            total += len(stroke)
            if total > 20000: raise ValueError('Signature is too complex. Please clear and retry.')
            points = []
            for point in stroke:
                if not isinstance(point, list) or len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in point):
                    raise ValueError('Invalid signature drawing.')
                points.append((round(point[0] * 1199), round(point[1] * 399)))
            draw.line(points, fill=(25, 25, 25, 255), width=4)
    bounds = image.getchannel('A').getbbox()
    if not bounds or bounds[2]-bounds[0] < 12 or bounds[3]-bounds[1] < 5:
        raise ValueError('The signature is blank or too small.')
    image = image.crop(bounds)
    image.thumbnail((1200, 400))
    output = BytesIO(); image.save(output, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()
