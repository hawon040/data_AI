import importlib.util
import os

# Vercel 배포용 진입점: 프로젝트 루트의 api.py 요청 처리기를 그대로 씁니다.
# api/ 폴더와 이름이 겹치므로 import 대신 파일 경로로 불러옵니다.
_ROOT_API = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api.py")
_spec = importlib.util.spec_from_file_location("tour_app", _ROOT_API)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

class handler(_module.TourRequestHandler):
    pass
