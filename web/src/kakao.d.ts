// 카카오맵 JS SDK는 공식 타입 패키지가 없어 최소한의 전역 선언만 둔다.
// 실제 지도 API는 window.kakao.maps.* 형태로 동적 스크립트 로드 후에만 존재한다.
export {};

declare global {
  interface Window {
    kakao: any;
  }
}
