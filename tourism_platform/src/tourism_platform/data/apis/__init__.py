"""분야별 data.go.kr API 설정: 관광지(tourism), 안전(safety), 날씨(weather), 대기질(air)."""
from .air import AIR_DATASETS
from .safety import SAFETY_DATASETS
from .tourism import TOURISM_DATASETS
from .weather import WEATHER_DATASETS

__all__ = ["AIR_DATASETS", "SAFETY_DATASETS", "TOURISM_DATASETS", "WEATHER_DATASETS"]
