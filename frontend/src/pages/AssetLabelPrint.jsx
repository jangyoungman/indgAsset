import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import api from '../utils/api';
import { useLookup } from '../hooks/useLookup';

const LABELS_PER_PAGE = 21; // 3열 x 7행

function BarcodeCanvas({ value, width = 1.2, height = 28 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: 'CODE128',
          displayValue: false,
          width,
          height,
          margin: 0,
        });
      } catch {
        // invalid barcode value
      }
    }
  }, [value, width, height]);

  return <canvas ref={canvasRef} />;
}

export default function AssetLabelPrint() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userName } = useLookup();

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ids = searchParams.get('ids')?.split(',').filter(Boolean).map(Number) || [];

  useEffect(() => {
    if (ids.length === 0) {
      setError('출력할 자산이 선택되지 않았습니다.');
      setLoading(false);
      return;
    }

    Promise.all(ids.map(id => api.get(`/assets/${id}`)))
      .then(responses => {
        setAssets(responses.map(r => r.data));
      })
      .catch(() => {
        setError('자산 정보를 불러오는데 실패했습니다.');
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-500">{error}</div>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          돌아가기
        </button>
      </div>
    );
  }

  // 인쇄용: 페이지별로 나누기
  const pages = [];
  for (let i = 0; i < assets.length; i += LABELS_PER_PAGE) {
    pages.push(assets.slice(i, i + LABELS_PER_PAGE));
  }

  // 미리보기용: 최대 21개
  const previewAssets = assets.slice(0, LABELS_PER_PAGE);

  return (
    <>
      {/* ── 인쇄 시 숨겨지는 화면 컨트롤 ── */}
      <div className="print-hidden max-w-5xl mx-auto p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-sm text-gray-500 hover:text-gray-800"
        >
          ← 돌아가기
        </button>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            스티커 출력 미리보기
          </h1>
          <p className="text-sm text-gray-500 mb-4">
            총 {assets.length}개 자산 · {pages.length}페이지
          </p>

          {assets.length > LABELS_PER_PAGE && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              미리보기는 첫 {LABELS_PER_PAGE}개만 표시됩니다.
              인쇄 시에는 전체 {assets.length}개가 {pages.length}페이지에 걸쳐 출력됩니다.
            </div>
          )}

          <button
            onClick={handlePrint}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            인쇄
          </button>
        </div>

        {/* ── 화면 미리보기 (A4 프레임) ── */}
        <div
          className="bg-white border border-gray-200 rounded-lg mx-auto"
          style={{
            width: '210mm',
            minHeight: '297mm',
            padding: '15.1mm 7.2mm 0 7.2mm',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 63.5mm)',
              gridTemplateRows: `repeat(7, 38.1mm)`,
              gap: 0,
            }}
          >
            {previewAssets.map(asset => (
              <LabelCell
                key={asset.id}
                asset={asset}
                userName={userName}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 인쇄 전용 영역 ── */}
      <div className="print-only">
        {pages.map((pageAssets, pageIdx) => (
          <div
            key={pageIdx}
            className="print-page"
            style={{
              width: '210mm',
              height: '297mm',
              padding: '15.1mm 7.2mm 0 7.2mm',
              pageBreakAfter: pageIdx < pages.length - 1 ? 'always' : 'auto',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 63.5mm)',
                gridTemplateRows: 'repeat(7, 38.1mm)',
                gap: 0,
              }}
            >
              {pageAssets.map(asset => (
                <LabelCell
                  key={asset.id}
                  asset={asset}
                  userName={userName}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── 인쇄 CSS ── */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-hidden {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }
        }

        @media screen {
          .print-only {
            display: none;
          }
        }
      `}</style>
    </>
  );
}

function LabelCell({ asset, userName }) {
  return (
    <div
      style={{
        width: '63.5mm',
        height: '38.1mm',
        border: '0.5px solid #ddd',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: '2mm 3mm',
        overflow: 'hidden',
      }}
    >
      {/* 상단 행: 왼쪽 INNODIGM / 오른쪽 담당자 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5mm',
          paddingBottom: '1.5mm',
          borderBottom: '0.5px solid #ddd',
          minHeight: '5mm',
        }}
      >
        <span
          style={{
            fontWeight: 'bold',
            color: '#1e3a5f',
            fontSize: '9pt',
            letterSpacing: '0.5px',
          }}
        >
          INNODIGM
        </span>
        <span style={{ fontSize: '7pt', color: '#555' }}>
          담당자: {userName(asset.assigned_to)}
        </span>
      </div>

      {/* 하단 행: 왼쪽 바코드 / 오른쪽 자산코드 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flex: 1,
          gap: '2mm',
        }}
      >
        <div style={{ flex: '1 1 auto', maxWidth: '38mm', overflow: 'hidden' }}>
          <BarcodeCanvas value={asset.asset_code} width={1.0} height={22} />
        </div>
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '7.5pt',
            textAlign: 'right',
            wordBreak: 'break-all',
            lineHeight: 1.2,
            maxWidth: '20mm',
          }}
        >
          {asset.asset_code}
        </div>
      </div>
    </div>
  );
}
