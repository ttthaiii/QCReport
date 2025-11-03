// Filename: src/components/PhotoGallery.tsx (REFACTORED for SVG Icons)

import React, { useState, useEffect, useMemo } from 'react';
import { api, Photo } from '../utils/api'; 
import styles from './PhotoGallery.module.css';

// ✅ [ใหม่] 1. Import ไอคอน SVG
import { FiImage, FiLoader, FiAlertTriangle } from 'react-icons/fi';

interface PhotoGalleryProps {
  projectId: string;
}

const cdnUrl = (process.env.REACT_APP_CDN_URL || '').replace(/\/$/, '');

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
        if (response.success && response.data) {
          const sortedPhotos = response.data.sort((a: Photo, b: Photo) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setPhotos(sortedPhotos);
        } else if (!response.success) {
          throw new Error(response.error || 'Failed to fetch photos');
        }
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

  // ✅ [แก้ไข] 2. เปลี่ยน Emoji เป็น SVG Icon
  if (isLoading) return <p className={styles.infoText}><FiLoader className={styles.iconSpin} /> Loading reports...</p>; // <--- 🔄
  if (error) return <p className={styles.errorText}><FiAlertTriangle /> Error: {error}</p>; // <--- ❌

  return (
    <div className={styles.galleryContainer}>
      {/* ✅ [แก้ไข] 3. เปลี่ยน Emoji เป็น SVG Icon */}
      <h1><FiImage style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Photo Reports for Project: {projectId}</h1> {/* <--- 📸 */}

      <div className={styles.filterBar}>
        <button className={styles.filterButton} onClick={() => setFilter('all')} disabled={filter === 'all'}>All Photos</button>
        <button className={styles.filterButton} onClick={() => setFilter('QC')} disabled={filter === 'QC'}>QC Reports</button>
        <button className={styles.filterButton} onClick={() => setFilter('Daily')} disabled={filter === 'Daily'}>Daily Reports</button>
      </div>

      <div className={styles.photoGrid}>
        {filteredPhotos.length > 0 ? (
          filteredPhotos.map(photo => {
                  const date = new Date(photo.createdAt);
                  const datePart = date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const timePart = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                  const formattedTimestamp = `${datePart} ${timePart}`;
                  
                  // ✅ ถ้ามี CDN URL ใช้ CDN, ถ้าไม่มีใช้ Firebase โดยตรง
                  const displayUrl = cdnUrl && photo.firepath 
                    ? `${cdnUrl}/${photo.firepath.replace(/^\//, '')}`
                    : photo.driveUrl;

                  return (
                      <div key={photo.id} className={styles.photoCard}>
                        <a href={displayUrl} target="_blank" rel="noopener noreferrer">
                          <div className={styles.photoImageContainer}>
                            <img 
                              src={displayUrl}
                              alt={photo.filename} 
                              className={styles.photoImage}
                            />
                          <div className={styles.watermarkOverlay}>
                            <span>{formattedTimestamp}</span>
                            <span>{photo.location || 'ไม่สามารถระบุตำแหน่งได้'}</span>
                          </div>
                        </div>
                      </a>
                      <div className={styles.photoContent}>
                        <p className={styles.photoText}>
                          {photo.reportType === 'QC' ? `Topic: ${photo.topic}` : `Desc: ${photo.description}`}
                        </p>
                        <small className={styles.photoTimestamp}>{new Date(photo.createdAt).toLocaleString()}</small>
                      </div>
                    </div>
                  )
                })
        ) : (
          <p className={styles.infoText}>No photos found for this project.</p>
        )}
      </div>
    </div>
  );
};

export default PhotoGallery;