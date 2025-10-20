// Filename: src/components/PhotoGallery.tsx

import React, { useState, useEffect, useMemo } from 'react';
// ✅ 1. แก้ไข: import 'Photo' interface จาก api.ts
import { api, Photo } from '../utils/api'; 

interface PhotoGalleryProps {
  projectId: string;
}

const getDisplayUrl = (driveUrl: string): string => {
  const USE_CDN = false;
  const CDN_ENDPOINT = 'https://bim-tracking-cdn.ttthaiii30.workers.dev';

  if (USE_CDN) {
    const url = new URL(driveUrl);
    return `${CDN_ENDPOINT}${url.pathname}`;
  }
  
  return driveUrl;
};

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ projectId }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'QC' | 'Daily'>('all');

  useEffect(() => {
    const fetchPhotos = async () => {
      if (!projectId) return;
      
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await api.getPhotosByProject(projectId); 
        
        // ✅ 2. แก้ไข: เพิ่มการตรวจสอบ response.success และ response.data ที่นี่
        if (response.success && response.data) {
          // ถ้ามีข้อมูล เราถึงจะทำการ sort
          const sortedPhotos = response.data.sort((a: Photo, b: Photo) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setPhotos(sortedPhotos);
        } else if (!response.success) {
          // ถ้า API ไม่สำเร็จ ให้โยน Error
          throw new Error(response.error || 'Failed to fetch photos');
        }
        // กรณีที่ success แต่ data เป็น array ว่างๆ ก็ไม่ต้องทำอะไร setPhotos([]) จะเป็นค่าเริ่มต้นอยู่แล้ว

      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPhotos();
  }, [projectId]);

  const filteredPhotos = useMemo(() => {
    if (filter === 'all') return photos;
    return photos.filter(p => p.reportType === filter);
  }, [photos, filter]);

  if (isLoading) return <p style={{ textAlign: 'center', padding: '20px' }}>🔄 Loading reports...</p>;
  if (error) return <p style={{ textAlign: 'center', padding: '20px', color: 'red' }}>❌ Error: {error}</p>;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>📸 Photo Reports for Project: {projectId}</h1>

      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <button onClick={() => setFilter('all')} disabled={filter === 'all'}>All Photos</button>
        <button onClick={() => setFilter('QC')} disabled={filter === 'QC'} style={{ marginLeft: '10px' }}>QC Reports</button>
        <button onClick={() => setFilter('Daily')} disabled={filter === 'Daily'} style={{ marginLeft: '10px' }}>Daily Reports</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {filteredPhotos.length > 0 ? (
          filteredPhotos.map(photo => (
            <div key={photo.id} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
              <a href={getDisplayUrl(photo.driveUrl)} target="_blank" rel="noopener noreferrer">
                <img 
                  src={getDisplayUrl(photo.driveUrl)}
                  alt={photo.filename} 
                  style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }} 
                />
              </a>
              <div style={{ padding: '15px' }}>
                <p style={{ fontWeight: 'bold', margin: '0 0 5px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {photo.reportType === 'QC' ? `Topic: ${photo.topic}` : `Desc: ${photo.description}`}
                </p>
                <small style={{ color: '#555' }}>{new Date(photo.createdAt).toLocaleString()}</small>
              </div>
            </div>
          ))
        ) : (
          <p style={{ textAlign: 'center', gridColumn: '1 / -1' }}>No photos found for this project.</p>
        )}
      </div>
    </div>
  );
};

export default PhotoGallery;