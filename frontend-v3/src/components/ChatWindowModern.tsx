import React, { useState, useEffect, useRef } from 'react';
import { Box, Paper, Typography, IconButton, TextField, Avatar, Chip, Button, Tooltip, CircularProgress, Alert } from '@mui/material';
import {
	Close as CloseIcon,
	Minimize as MinimizeIcon,
	Send as SendIcon,
	AttachFile as AttachFileIcon,
	Lock as LockIcon,
	CheckCircle as SoldIcon,
} from '@mui/icons-material';
import Draggable from 'react-draggable';
import { useAuth } from '../context/AuthContext';
import { chatApi, Message, Chat } from '../services/chatApi';
import { format, isToday, isYesterday } from 'date-fns';
import TripCard from './TripCard';

interface ChatWindowModernProps {
	chatId: string;
	onClose: () => void;
	contextType?: string;
	initialPosition?: { x: number; y: number };
}

export default function ChatWindowModern({
	chatId,
	onClose,
	contextType,
	initialPosition = { x: window.innerWidth - 450, y: 100 },
}: ChatWindowModernProps) {
	const { user } = useAuth();
	const [chat, setChat] = useState<Chat | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [newMessage, setNewMessage] = useState('');
	const [isMinimized, setIsMinimized] = useState(false);
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState('');
	const [isTyping, setIsTyping] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const nodeRef = useRef(null);

	const isLokaChat = chatId === 'loka-ai-chat' || contextType === 'ai_assistant';

	// Helper to extract trips from message
	const extractTripsFromMessage = (msg: Message): any[] => {
		// Check if message has trips metadata (from AI response)
		if ((msg as any).trips && Array.isArray((msg as any).trips)) {
			return (msg as any).trips;
		}
		return [];
	};

	useEffect(() => {
		fetchChatAndMessages();
		// Poll for new messages
		// Loka AI: 5 seconds (to get AI responses quickly)
		// Group chats: 30 seconds
		const pollInterval = isLokaChat ? 5000 : 30000;

		const interval = setInterval(() => {
			fetchMessages();
		}, pollInterval);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chatId, isLokaChat]);

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	const fetchChatAndMessages = async () => {
		try {
			setLoading(true);
			const [chatData, messagesData] = await Promise.all([chatApi.getChat(chatId), chatApi.getMessages(chatId)]);
			setChat(chatData);
			// Ensure messagesData is an array
			setMessages(Array.isArray(messagesData) ? messagesData : []);

			// Mark as read
			if (Array.isArray(messagesData) && messagesData.length > 0) {
				chatApi.markAsRead(chatId);
			}
		} catch (err: any) {
			console.error('Error fetching chat:', err);
			setError(err.response?.data?.error || 'Failed to load chat');
		} finally {
			setLoading(false);
		}
	};

	const fetchMessages = async () => {
		// Don't fetch messages for Loka chat - they're handled locally
		if (isLokaChat) {
			return;
		}

		try {
			const messagesData = await chatApi.getMessages(chatId);
			const newMessages = Array.isArray(messagesData) ? messagesData : [];

			// Always update messages to get latest
			setMessages(newMessages);

			// Mark as read if there are messages
			if (newMessages.length > 0) {
				chatApi.markAsRead(chatId).catch((err) => {
					console.error('Error marking as read:', err);
				});
			}
		} catch (err) {
			console.error('Error fetching messages:', err);
		}
	};

	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newMessage.trim() || sending || chat?.locked) return;

		const messageText = newMessage.trim();
		setNewMessage('');

		// Handle Loka AI chat
		if (isLokaChat) {
			setSending(true);

			// Optimistic update - add user message immediately
			const tempId = Date.now().toString();
			const userMsg: Message = {
				_id: tempId,
				chatId: 'loka-ai-chat',
				senderId: user?.id || '',
				senderName: user?.name || 'Me',
				senderEmail: user?.email || '',
				text: messageText,
				timestamp: new Date(),
				readBy: [],
			};

			setMessages((prev) => [...prev, userMsg]);
			setIsTyping(true);

			try {
				const token = localStorage.getItem('authToken');
				// Use proxy in development (/api), direct URL in production
				const apiUrl = import.meta.env.DEV ? '/api/ai/message' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api') + '/ai/message';

				const response = await fetch(apiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						message: messageText,
						context: { userId: user?.id },
					}),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
					throw new Error(errorData.error || `HTTP ${response.status}: Failed to get AI response`);
				}

				const data = await response.json();

				// Simulate typing delay
				setTimeout(() => {
					const aiMsg: Message & { trips?: any[] } = {
						_id: Date.now().toString(),
						chatId: 'loka-ai-chat',
						senderId: 'loka-ai',
						senderName: 'Loka',
						senderEmail: 'ai@meetloca.com',
						text: data.text || data.message || 'Sorry, I could not process that request.',
						timestamp: new Date(),
						readBy: [],
						trips: data.trips || [], // Include trips data if available
					};
					setMessages((prev) => [...prev, aiMsg]);
					setIsTyping(false);
					setSending(false);
				}, 1000);
			} catch (err: any) {
				console.error('AI Error:', err);
				setIsTyping(false);
				setSending(false);

				// Show more detailed error message
				const errorMessage = err.message || 'Failed to get AI response. Please try again.';
				setError(errorMessage);

				// Remove the optimistic message on error
				setMessages((prev) => prev.filter((msg) => msg._id !== tempId));
			}
			return;
		}

		// Regular chat handling
		try {
			setSending(true);
			await chatApi.sendMessage(chatId, messageText);
			await fetchMessages();
		} catch (err: any) {
			console.error('Error sending message:', err);
			setError(err.response?.data?.error || 'Failed to send message');
		} finally {
			setSending(false);
		}
	};

	const handleMarkAsSold = async () => {
		if (!confirm('Mark this item as sold? This will lock the chat.')) return;

		try {
			await chatApi.markItemAsSold(chatId);
			await fetchChatAndMessages();
			alert('Item marked as sold successfully!');
		} catch (err: any) {
			console.error('Error marking as sold:', err);
			alert(err.response?.data?.error || 'Failed to mark item as sold');
		}
	};

	const getChatTitle = () => {
		if (!chat) return 'Chat';

		if (chat.contextType === 'quicket_item') {
			return chat.metadata?.itemTitle || 'Quicket Item';
		} else if (chat.contextType === 'trip') {
			return chat.metadata?.tripName || 'Trip Chat';
		} else if (chat.contextType === 'direct') {
			const otherUser = chat.participants.find((p) => p.userId !== user?.id);
			return otherUser?.name || 'Direct Chat';
		}
		return 'Chat';
	};

	const formatMessageTime = (timestamp: Date) => {
		const date = new Date(timestamp);
		if (isToday(date)) {
			return format(date, 'h:mm a');
		} else if (isYesterday(date)) {
			return `Yesterday ${format(date, 'h:mm a')}`;
		} else {
			return format(date, 'MMM d, h:mm a');
		}
	};

	const groupMessages = () => {
		const grouped: Array<{
			senderId: string;
			senderName: string;
			messages: Message[];
			isCurrentUser: boolean;
		}> = [];

		// Safety check: ensure messages is an array
		if (!Array.isArray(messages)) {
			console.error('Messages is not an array:', messages);
			return grouped;
		}

		messages.forEach((msg) => {
			const isCurrentUser = msg.senderId === user?.id || msg.senderId === 'system';
			const lastGroup = grouped[grouped.length - 1];

			if (lastGroup && lastGroup.senderId === msg.senderId) {
				lastGroup.messages.push(msg);
			} else {
				grouped.push({
					senderId: msg.senderId,
					senderName: msg.senderName,
					messages: [msg],
					isCurrentUser: msg.senderId === user?.id,
				});
			}
		});

		return grouped;
	};

	const isSellerInQuicketChat = () => {
		if (chat?.contextType !== 'quicket_item') return false;
		const currentUserParticipant = chat.participants.find((p) => p.userId === user?.id);
		return currentUserParticipant?.role === 'seller';
	};

	if (loading) {
		return (
			<Draggable nodeRef={nodeRef} handle=".drag-handle">
				<Paper
					ref={nodeRef}
					sx={{
						position: 'fixed',
						width: 400,
						height: 300,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 1300,
						left: initialPosition.x,
						top: initialPosition.y,
					}}
					elevation={8}
				>
					<CircularProgress />
				</Paper>
			</Draggable>
		);
	}

	return (
		<Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
			<Paper
				ref={nodeRef}
				sx={{
					position: 'fixed',
					width: 400,
					height: isMinimized ? 'auto' : 600,
					display: 'flex',
					flexDirection: 'column',
					zIndex: 1300,
					left: initialPosition.x,
					top: initialPosition.y,
					overflow: 'hidden',
				}}
				elevation={8}
			>
				{/* Header */}
				<Box
					className="drag-handle"
					sx={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						p: 2,
						bgcolor: 'primary.main',
						color: 'primary.contrastText',
						cursor: 'move',
					}}
				>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1,
							flex: 1,
							minWidth: 0,
						}}
					>
						<Typography variant="h6" noWrap sx={{ flex: 1 }}>
							{getChatTitle()}
						</Typography>
						{chat?.locked && (
							<Tooltip title="Item sold - Chat locked">
								<LockIcon fontSize="small" />
							</Tooltip>
						)}
					</Box>
					<Box sx={{ display: 'flex', gap: 0.5 }}>
						<IconButton size="small" onClick={() => setIsMinimized(!isMinimized)} sx={{ color: 'inherit' }}>
							<MinimizeIcon />
						</IconButton>
						<IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
							<CloseIcon />
						</IconButton>
					</Box>
				</Box>

				{!isMinimized && (
					<>
						{/* Context Info */}
						{chat?.contextType === 'quicket_item' && chat.metadata && (
							<Box
								sx={{
									p: 2,
									bgcolor: 'grey.100',
									borderBottom: 1,
									borderColor: 'divider',
								}}
							>
								<Typography variant="caption" color="text.secondary">
									{chat.metadata.itemType} • ${chat.metadata.itemPrice?.selling}
								</Typography>
								{chat.locked && <Chip icon={<LockIcon />} label="Item Sold - Read Only" size="small" color="warning" sx={{ mt: 1 }} />}
							</Box>
						)}

						{/* Error Alert */}
						{error && (
							<Alert severity="error" onClose={() => setError('')} sx={{ m: 2 }}>
								{error}
							</Alert>
						)}

						{/* Messages Area */}
						<Box
							sx={{
								flex: 1,
								overflowY: 'auto',
								p: 2,
								display: 'flex',
								flexDirection: 'column',
								gap: 2,
								bgcolor: 'grey.50',
							}}
						>
							{groupMessages().map((group, groupIndex) => (
								<Box
									key={groupIndex}
									sx={{
										display: 'flex',
										flexDirection: 'column',
										alignItems: group.isCurrentUser ? 'flex-end' : 'flex-start',
										gap: 0.5,
									}}
								>
									{/* Sender Name (only for others' messages) */}
									{!group.isCurrentUser && group.senderId !== 'system' && (
										<Box
											sx={{
												display: 'flex',
												alignItems: 'center',
												gap: 1,
												pl: 1,
											}}
										>
											<Avatar sx={{ width: 24, height: 24 }} alt={group.senderName}>
												{group.senderName.charAt(0).toUpperCase()}
											</Avatar>
											<Typography variant="caption" color="text.secondary">
												{group.senderName}
											</Typography>
										</Box>
									)}

									{/* Messages in Group */}
									{group.messages.map((msg) => {
										const trips = extractTripsFromMessage(msg);
										const hasTrips = trips.length > 0;

										return (
											<Box
												key={msg._id}
												sx={{
													maxWidth: '100%',
													width: '100%',
													display: 'flex',
													flexDirection: 'column',
													alignItems: group.isCurrentUser ? 'flex-end' : 'flex-start',
												}}
											>
												{/* Show trips as cards if available */}
												{hasTrips && !group.isCurrentUser && (
													<Box sx={{ width: '100%', mb: 1 }}>
														{trips.map((trip: any) => (
															<TripCard
																key={trip.id}
																name={trip.name}
																destinations={trip.destinations || []}
																startDate={trip.startDate}
																endDate={trip.endDate}
																duration={trip.duration}
																daysUntil={trip.daysUntil}
																status={trip.status}
																flights={trip.flights}
																hotels={trip.hotels}
																attractions={trip.attractions}
															/>
														))}
													</Box>
												)}

												{/* Message Bubble - only show text if not all trips */}
												{(!hasTrips || msg.text.trim().length > 0) && (
													<Paper
														elevation={1}
														sx={{
															px: 2,
															py: 1,
															borderRadius: 2,
															bgcolor: msg.isSystemMessage ? 'warning.light' : group.isCurrentUser ? 'primary.main' : 'white',
															color: msg.isSystemMessage ? 'warning.contrastText' : group.isCurrentUser ? 'primary.contrastText' : 'text.primary',
															wordBreak: 'break-word',
															maxWidth: hasTrips ? '100%' : '75%',
														}}
													>
														<Box
															component="div"
															sx={{
																whiteSpace: 'pre-wrap',
																lineHeight: 1.7,
																'& strong': {
																	fontWeight: 700,
																	display: 'block',
																	mb: 0.5,
																},
															}}
														>
															{msg.text.split('\n').map((line, idx, arr) => {
																// Skip trip lines if we're showing cards
																if (
																	hasTrips &&
																	(line.trim().startsWith('━━━') ||
																		line.trim().startsWith('✈️') ||
																		line.includes('**יעדים:**') ||
																		line.includes('**תאריכים:**') ||
																		line.includes('**משך:**') ||
																		line.includes('**סטטוס:**'))
																) {
																	return null;
																}

																// Format trip entries (lines starting with ✈️) - only if no cards
																if (!hasTrips && line.trim().startsWith('✈️')) {
																	const isLastTrip = !arr.slice(idx + 1).some((l) => l.trim().startsWith('✈️'));
																	return (
																		<Box
																			key={idx}
																			sx={{
																				mb: isLastTrip ? 0 : 2,
																				pb: isLastTrip ? 0 : 1.5,
																				borderBottom: isLastTrip ? 'none' : '1px solid rgba(0,0,0,0.08)',
																			}}
																		>
																			<Typography
																				variant="body2"
																				sx={{
																					fontWeight: 500,
																					'& strong': {
																						fontWeight: 700,
																						display: 'inline',
																					},
																				}}
																				dangerouslySetInnerHTML={{
																					__html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
																				}}
																			/>
																		</Box>
																	);
																}
																// Regular lines
																return (
																	<Typography
																		key={idx}
																		variant="body2"
																		sx={{
																			mb: idx < arr.length - 1 ? 0.5 : 0,
																			'& strong': {
																				fontWeight: 700,
																				display: 'inline',
																			},
																		}}
																		dangerouslySetInnerHTML={{
																			__html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
																		}}
																	/>
																);
															})}
														</Box>
													</Paper>
												)}

												{/* Timestamp */}
												<Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, px: 1 }}>
													{formatMessageTime(msg.timestamp)}
												</Typography>
											</Box>
										);
									})}
								</Box>
							))}

							{/* Typing Indicator for Loka AI */}
							{isTyping && isLokaChat && (
								<Box
									sx={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: 1,
										mb: 1,
									}}
								>
									<Avatar
										sx={{
											width: 32,
											height: 32,
											bgcolor: 'primary.main',
											fontSize: 14,
										}}
									>
										L
									</Avatar>
									<Paper
										elevation={1}
										sx={{
											px: 2,
											py: 1.5,
											borderRadius: 2,
											bgcolor: 'white',
										}}
									>
										<Box sx={{ display: 'flex', gap: 0.5 }}>
											<CircularProgress size={12} />
											<Typography variant="caption" color="text.secondary">
												Loka is typing...
											</Typography>
										</Box>
									</Paper>
								</Box>
							)}

							<div ref={messagesEndRef} />
						</Box>

						{/* Action Buttons (Seller in Quicket Chat) */}
						{isSellerInQuicketChat() && !chat?.locked && (
							<Box sx={{ px: 2, pb: 1 }}>
								<Button fullWidth variant="contained" color="success" startIcon={<SoldIcon />} onClick={handleMarkAsSold} size="small">
									Mark as Sold
								</Button>
							</Box>
						)}

						{/* Input Area */}
						<Box
							component="form"
							onSubmit={handleSendMessage}
							sx={{
								p: 2,
								borderTop: 1,
								borderColor: 'divider',
								bgcolor: 'background.paper',
							}}
						>
							{chat?.locked ? (
								<Alert severity="info" icon={<LockIcon />}>
									This chat is locked. The item has been sold.
								</Alert>
							) : (
								<Box sx={{ display: 'flex', gap: 1 }}>
									<IconButton size="small" disabled>
										<AttachFileIcon />
									</IconButton>
									<TextField
										fullWidth
										size="small"
										placeholder="Type a message..."
										value={newMessage}
										onChange={(e) => setNewMessage(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault();
												handleSendMessage(e);
											}
										}}
										disabled={sending}
										multiline
										maxRows={3}
									/>
									<IconButton type="submit" color="primary" disabled={!newMessage.trim() || sending}>
										{sending ? <CircularProgress size={24} /> : <SendIcon />}
									</IconButton>
								</Box>
							)}
						</Box>
					</>
				)}
			</Paper>
		</Draggable>
	);
}
