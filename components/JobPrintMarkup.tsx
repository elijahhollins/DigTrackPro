import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Job, DigTicket, JobPrint, PrintMarker, TicketStatus } from '../types';
import { apiService } from '../services/apiService';
import { getTicketStatus } from '../utils/dateUtils';

// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface JobPrintMarkupProps {
  job: Job;
  tickets: DigTicket[];
  onClose: () => void;
  onViewTicket: (url: string) => void;
  isDarkMode: boolean;
}

export const JobPrintMarkup: React.FC<JobPrintMarkupProps> = ({ 
  job, 
  tickets, 
  onClose, 
  onViewTicket, 
  isDarkMode 
}) => {
  const [prints, setPrints] = useState<JobPrint[]>([]);
  const [selectedPrint, setSelectedPrint] = useState<JobPrint | null>(null);
  const [markers, setMarkers] = useState<PrintMarker[]>([]);
  const [isPinMode, setIsPinMode] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [numPages, setNumPages] = useState<number>(1);
  const [pageNumber, setPageNumber] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // New state for replace feature (after line 52)
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [markerToReplace, setMarkerToReplace] = useState<PrintMarker | null>(null);
  const [isPDF, setIsPDF] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load prints on mount
  useEffect(() => {
    loadPrints();
  }, [job.jobNumber]);

  // Load markers when print is selected
  useEffect(() => {
    if (selectedPrint) {
      loadMarkers();
      loadPrintContent();
    }
  }, [selectedPrint]);

  // Render PDF page when PDF document or page number changes
  useEffect(() => {
    if (isPDF && pdfDocument && canvasRef.current) {
      renderPDFPage();
    }
  }, [isPDF, pdfDocument, pageNumber, scale]);

  const loadPrintContent = async () => {
    if (!selectedPrint) return;
    
    // Check if the file is a PDF
    const fileName = selectedPrint.fileName.toLowerCase();
    const isPDFFile = fileName.endsWith('.pdf');
    setIsPDF(isPDFFile);
    
    if (isPDFFile) {
      try {
        const loadingTask = pdfjsLib.getDocument(selectedPrint.url);
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);
        setPageNumber(1);
      } catch (error: any) {
        console.error('Error loading PDF:', error);
        alert(`Failed to load PDF: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const renderPDFPage = async () => {
    if (!pdfDocument || !canvasRef.current) return;
    
    try {
      const page = await pdfDocument.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;
      
      const viewport = page.getViewport({ scale: scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
    } catch (error) {
      console.error('Error rendering PDF page:', error);
    }
  };

  const loadPrints = async () => {
    setIsLoading(true);
    const jobPrints = await apiService.getJobPrints(job.jobNumber);
    setPrints(jobPrints);
    if (jobPrints.length > 0) {
      setSelectedPrint(jobPrints[0]);
    }
    setIsLoading(false);
  };

  const loadMarkers = async () => {
    if (!selectedPrint) return;
    const printMarkers = await apiService.getPrintMarkers(selectedPrint.id);
    setMarkers(printMarkers);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const newPrint = await apiService.uploadJobPrint(job.jobNumber, file);
      setPrints([newPrint]);
      setSelectedPrint(newPrint);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file');
    }
    setUploadingFile(false);
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLCanvasElement | HTMLImageElement>) => {
    if (!isPinMode || !selectedTicketId) return;
    
    const element = isPDF ? canvasRef.current : imageRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    const ticket = tickets.find(t => t.id === selectedTicketId);
    if (!ticket || !selectedPrint) return;

    try {
      const newMarker = await apiService.savePrintMarker({
        printId: selectedPrint.id,
        ticketId: selectedTicketId,
        xPercent,
        yPercent,
        pageNumber,
        label: ticket.ticketNo
      });
      setMarkers(prev => [...prev, newMarker]);
      setIsPinMode(false);
      setSelectedTicketId(null);
    } catch (error) {
      console.error('Failed to save marker:', error);
      alert('Failed to place marker');
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.min(Math.max(prev * delta, 0.1), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPinMode) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isPinMode) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const deleteMarker = async (markerId: string) => {
    try {
      await apiService.deletePrintMarker(markerId);
      setMarkers(prev => prev.filter(m => m.id !== markerId));
    } catch (error) {
      console.error('Failed to delete marker:', error);
      alert('Failed to delete marker');
    }
  };

  // New function for replace feature (after deleteMarker at line 315)
  const handleReplaceTicket = (markerId: string) => {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;
    setMarkerToReplace(marker);
    setShowReplaceModal(true);
  };

  // New function to save ticket replacement
  const saveTicketReplacement = async (newTicketId: string) => {
    if (!markerToReplace) return;

    try {
      // Get the old and new tickets
      const oldTicket = tickets.find(t => t.id === markerToReplace.ticketId);
      const newTicket = tickets.find(t => t.id === newTicketId);
      
      if (!oldTicket || !newTicket) {
        alert('Ticket not found');
        return;
      }

      // Archive the old ticket
      await apiService.saveTicket({ ...oldTicket, isArchived: true });

      // Update the marker with new ticket info
      await apiService.deletePrintMarker(markerToReplace.id);
      const updatedMarker = await apiService.savePrintMarker({
        printId: markerToReplace.printId,
        ticketId: newTicketId,
        xPercent: markerToReplace.xPercent,
        yPercent: markerToReplace.yPercent,
        pageNumber: markerToReplace.pageNumber,
        label: newTicket.ticketNo
      });

      // Update local state
      setMarkers(prev => prev.map(m => 
        m.id === markerToReplace.id ? updatedMarker : m
      ));

      // Close modal
      setShowReplaceModal(false);
      setMarkerToReplace(null);

      alert('Ticket replaced successfully');
    } catch (error) {
      console.error('Failed to replace ticket:', error);
      alert('Failed to replace ticket');
    }
  };

  const getTicketForMarker = (marker: PrintMarker): DigTicket | undefined => {
    return tickets.find(t => t.id === marker.ticketId);
  };

  const getMarkerColor = (marker: PrintMarker): string => {
    const ticket = getTicketForMarker(marker);
    if (!ticket) return 'bg-slate-500';
    
    const status = getTicketStatus(ticket);
    switch (status) {
      case TicketStatus.VALID:
        return 'bg-emerald-500';
      case TicketStatus.EXTENDABLE:
        return 'bg-orange-500';
      case TicketStatus.REFRESH_NEEDED:
        return 'bg-amber-500';
      case TicketStatus.EXPIRED:
        return 'bg-rose-600';
      default:
        return 'bg-slate-500';
    }
  };

  const activeTickets = tickets.filter(t => !t.isArchived);

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-white/10 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{job.jobNumber} - Blueprint Markup</h2>
          <p className="text-sm text-slate-400">{job.customer} • {job.address}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-slate-800 border-r border-white/10 overflow-y-auto p-4 space-y-4">
          {/* Upload Section */}
          <div className="space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              {uploadingFile ? 'Uploading...' : '+ Upload Print/Blueprint'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Tickets List */}
          {selectedPrint && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-300 uppercase">Pin Tickets</h3>
              {activeTickets.map(ticket => {
                const status = getTicketStatus(ticket);
                const isExpired = status === TicketStatus.EXPIRED;
                
                return (
                  <div
                    key={ticket.id}
                    className={`p-3 rounded-lg border ${
                      isPinMode && selectedTicketId === ticket.id
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : isExpired
                        ? 'bg-rose-900/30 border-rose-700 text-rose-200'
                        : 'bg-slate-700 border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{ticket.ticketNo}</span>
                      <button
                        onClick={() => {
                          setIsPinMode(true);
                          setSelectedTicketId(ticket.id);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          isPinMode && selectedTicketId === ticket.id
                            ? 'bg-white text-blue-600'
                            : 'bg-slate-600 hover:bg-slate-500 text-white'
                        }`}
                      >
                        {isPinMode && selectedTicketId === ticket.id ? 'Placing...' : 'Pin'}
                      </button>
                    </div>
                    <div className="text-xs opacity-75">{ticket.street}</div>
                    {isExpired && (
                      <div className="text-xs text-rose-300 mt-1">⚠ Expired</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Controls */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-300 uppercase">Controls</h3>
            {isPDF && numPages > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                    disabled={pageNumber <= 1}
                    className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm"
                  >
                    Prev
                  </button>
                  <span className="text-white text-sm px-2">
                    {pageNumber} / {numPages}
                  </span>
                  <button
                    onClick={() => setPageNumber(prev => Math.min(numPages, prev + 1))}
                    disabled={pageNumber >= numPages}
                    className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => setScale(1)}
              className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
            >
              Reset Zoom
            </button>
            <button
              onClick={() => setPosition({ x: 0, y: 0 })}
              className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
            >
              Reset Position
            </button>
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden">
          {!selectedPrint ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-lg">No print selected</p>
                <p className="text-sm">Upload a blueprint to get started</p>
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="absolute inset-0 overflow-hidden cursor-move"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
                className="relative inline-block"
              >
                {isPDF ? (
                  <canvas
                    ref={canvasRef}
                    onClick={handleImageClick}
                    className={`max-w-none ${isPinMode ? 'cursor-crosshair' : 'cursor-grab'}`}
                    style={{ userSelect: 'none' }}
                  />
                ) : (
                  <img
                    ref={imageRef}
                    src={selectedPrint.url}
                    alt="Blueprint"
                    onClick={handleImageClick}
                    className={`max-w-none ${isPinMode ? 'cursor-crosshair' : 'cursor-grab'}`}
                    style={{ userSelect: 'none' }}
                    draggable={false}
                  />
                )}

                {/* Markers (line 406-455) */}
                {markers
                  .filter(m => m.pageNumber === pageNumber)
                  .map(marker => {
                    const ticket = getTicketForMarker(marker);
                    const isExpired = ticket && getTicketStatus(ticket) === TicketStatus.EXPIRED;
                    const isHovered = hoveredMarkerId === marker.id;

                    return (
                      <div
                        key={marker.id}
                        style={{
                          position: 'absolute',
                          left: `${marker.xPercent}%`,
                          top: `${marker.yPercent}%`,
                          transform: 'translate(-50%, -50%)'
                        }}
                        onMouseEnter={() => setHoveredMarkerId(marker.id)}
                        onMouseLeave={() => setHoveredMarkerId(null)}
                      >
                        {/* Marker Pin */}
                        <div className={`${getMarkerColor(marker)} w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold cursor-pointer`}>
                          {marker.label}
                        </div>

                        {/* Tooltip */}
                        {isHovered && ticket && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-white/20 whitespace-nowrap z-10">
                            <div className="font-semibold text-sm mb-1">{ticket.ticketNo}</div>
                            <div className="text-xs text-slate-300 mb-2">{ticket.street}</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => onViewTicket(ticket.documentUrl || '')}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                              >
                                View
                              </button>
                              {isExpired && (
                                <button
                                  onClick={() => handleReplaceTicket(marker.id)}
                                  className="px-2 py-1 bg-orange-600 hover:bg-orange-700 rounded text-xs"
                                >
                                  Replace Pin
                                </button>
                              )}
                              <button
                                onClick={() => deleteMarker(marker.id)}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 rounded text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Pin Mode Indicator */}
          {isPinMode && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg font-semibold">
              Click on the blueprint to place pin
            </div>
          )}
        </div>
      </div>

      {/* Replace Modal */}
      {showReplaceModal && markerToReplace && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Replace Expired Ticket</h3>
            
            {/* Current Ticket Info */}
            <div className="mb-4 p-3 bg-rose-900/30 border border-rose-700 rounded-lg">
              <div className="text-sm text-rose-200 mb-1">Current Ticket:</div>
              {(() => {
                const currentTicket = getTicketForMarker(markerToReplace);
                return currentTicket ? (
                  <>
                    <div className="font-semibold text-white">{currentTicket.ticketNo}</div>
                    <div className="text-sm text-slate-300">{currentTicket.street}</div>
                  </>
                ) : (
                  <div className="text-slate-400">Ticket not found</div>
                );
              })()}
            </div>

            {/* Replacement Ticket Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Replacement Ticket:
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeTickets
                  .filter(t => t.id !== markerToReplace.ticketId)
                  .map(ticket => {
                    const status = getTicketStatus(ticket);
                    const isExpired = status === TicketStatus.EXPIRED;
                    
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => saveTicketReplacement(ticket.id)}
                        disabled={isExpired}
                        className={`w-full p-3 rounded-lg text-left transition-colors ${
                          isExpired
                            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-700 hover:bg-slate-600 text-white'
                        }`}
                      >
                        <div className="font-medium text-sm">{ticket.ticketNo}</div>
                        <div className="text-xs opacity-75">{ticket.street}</div>
                        {isExpired && (
                          <div className="text-xs text-rose-400 mt-1">Expired - Cannot use</div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReplaceModal(false);
                  setMarkerToReplace(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};