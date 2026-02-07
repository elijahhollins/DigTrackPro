import React, { useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';

const JobPrintMarkup = () => {
    const [scale, setScale] = useState(1); // Changed initial state scale from 0.1 to 1
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    
    const handleWheel = (event) => {
        event.preventDefault();
        const increment = event.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.min(Math.max(scale + increment, 0.1), 5); // Updated zoom scale limits
        setScale(newScale);
    };

    useEffect(() => {
        window.addEventListener('wheel', handleWheel);
        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, [scale]);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
    };

    return (
        <div>
            <Document
                file="somefile.pdf"
                onLoadSuccess={onDocumentLoadSuccess}
            >
                <Page pageNumber={pageNumber} scale={scale} />
            </Document>
            <p>Page {pageNumber} of {numPages}</p>
        </div>
    );
};

export default JobPrintMarkup;