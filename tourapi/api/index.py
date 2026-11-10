import importlib.util
import os
import sys

# Vercel 배포용 진입점: 프로젝트 루트의 api.py 요청 처리기를 그대로 씁니다.
# api/ 폴더와 이름이 겹치므로 import 대신 파일 경로로 불러옵니다.
_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ROOT_API = os.path.join(_ROOT_DIR, "api.py")
# api.py가 `from weather import ...`로 같은 폴더의 weather.py를 찾을 수 있게 합니다.
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)
_spec = importlib.util.spec_from_file_location("tour_app", _ROOT_API)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

class handler(_module.TourRequestHandler):
    pass
