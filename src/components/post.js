import { h, Component } from 'preact';
import { TextField, Button, Icon, Menu } from 'preact-mdl';
import parseMessageText from 'parse-message';
import neatime from 'neatime';
import { bind } from 'decko';
import { emit } from '../pubsub';

const EMPTY = {};


const RENDERERS = {
	image: props => (<ImageViewer {...props} />),

	gif: props => (<ImageViewer {...props} />),

	video: props => (<VideoPlayer {...props} />),

	text: ({ text }) => (<p>{ parseMessageText(text) || ' ' }</p>),

	mention: props => RENDERERS.comment({
		commentBody:`${(props.author || props.authorStream || EMPTY).displayName} mentioned you`,
		...props
	}),

	tag: props => RENDERERS.comment({
		commentBody:`${(props.author || props.authorStream || EMPTY).displayName} tagged you`,
		...props
	}),

	comment: ({ type, commentBody, postMessage, author, authorStream, postID }) => (
		<div class={`comment-block comment-type-${type}`}>
			{ renderItem(postMessage && postMessage[0] || EMPTY) }
			<div class="comment">
				{ RENDERERS.text({ text:commentBody }) }
				<author>{ (author || authorStream || EMPTY).displayName || null }</author>
			</div>
		</div>
	),

	like: ({ postMessage, authorStream, postID }) => (
		<div class="like-block">
			{ renderItem(postMessage[0]) }
			<div class="like">
				{ authorStream.displayName } liked this
			</div>
		</div>
	),

	link: ({ title, description, url, imageURL }) => (
		<div class="item-link">
			<a href={url} target="_blank">{ title }</a>
			<p>{ description }</p>
			<img src={imageURL} />
		</div>
	),

	music: props => (<MusicPlayer {...props} />),

	location: ({ name, iconSrc, lat, long, ...props }) => (
		<a href={`https://www.google.com/maps/place/${encodeURIComponent(name)}/@${encodeURIComponent(lat)},${encodeURIComponent(long)},17z/`} target="_blank" style="display:block;">
			{ iconSrc ? <img src={iconSrc} width="26" height="26" style="float:left; background:#CCC; border-radius:50%;" /> : null }
			<div style="overflow:hidden; padding:5px;">{ name }</div>
		</a>
	)
};


const renderItem = item => {
	let fn = RENDERERS[String(item.type).toLowerCase()];
	if (!fn) {
		if (Object.keys(item).length>0) {
			console.warn(`Unknown type: ${item.type}`, item);
		}
		return null;
	}
	return <div class={'item item-'+item.type}>{ fn(item) }</div>;
};



const noBubble = e => {
	if (e) e.stopPropagation();
};



export default class Post extends Component {
	constructor(props) {
		super(props);
		this.state = { newComment: '', comments:[] };
	}

	@bind
	goAuthor(e) {
		let { author, body } = this.props,
			inlineAuthor = e && e.target && e.target.getAttribute('data-author-id'),
			id = inlineAuthor || (author && author.id) || (body && body.authorStream && body.authorStream.id);
		if (id) {
			emit('go', { url:`/profile/${encodeURIComponent(id)}` });
		}
		noBubble(e);
		return false;
	}

	isLiked() {
		let { id, likedByMe } = this.props,
			{ localLikes } = peach.store.getState();
		return localLikes && localLikes.hasOwnProperty(id) ? localLikes[id] : likedByMe || false;
	}

	likeCount() {
		let { id, likeCount, likedByMe } = this.props,
			{ localLikes } = peach.store.getState();
		return (likeCount || 0) + (localLikes && localLikes[id]===true && likedByMe!==true ? 1 : 0);
	}

	@bind
	toggleLike(e) {
		let liked = !this.isLiked(),
			{ id } = this.props,
			{ localLikes={} } = peach.store.getState();
		localLikes[id] = liked;
		peach.store.setState({ localLikes });
		this.setState({ liked });
		peach[liked?'like':'unlike'](id, err => {
			if (err) alert(`Error: ${err}`);
		});
		noBubble(e);
	}

	@bind
	clickComment(e) {
		let t = e.target,
			author;
		do {
			if (String(t.nodeName).toUpperCase()==='A') return;
			let a = t && t.getAttribute && t.getAttribute('data-author-name');
			if (a) author = a;
		} while( (t=t.parentNode) );
		this.setState({
			newComment: `@${author} ${this.statenewComment || ''}`
		});
		setTimeout(this.focusCommentField, 50);
	}

	@bind
	focusCommentField() {
		this.base.querySelector('.post-new-comment textarea').focus();
	}

	@bind
	renderInlineComment({ author, body }) {
		let avatar = author.avatarSrc;
		peach.cacheStream(author);
		return (
			<div class="comment" data-author-name={author.name} onClick={this.clickComment}>
				<div class="avatar" data-author-id={author.id} onClick={this.goAuthor} style={avatar ? `background-image: url(${avatar});` : null} />
				{ RENDERERS.text({ text:body }) }
				<author>{ author.displayName }</author>
			</div>
		);
	}

	@bind
	maybeComment(e) {
		if (e && e.keyCode && e.keyCode===13) {
			return this.comment(e);
		}
	}

	@bind
	comment(e) {
		let { id } = this.props,
			{ newComment, comments=[] } = this.state,
			author = peach.store.getState().profile || {};
		if (newComment) {
			// comments.push({ author, body:newComment });
			// this.setState({ newComment: '', comments });
			peach.comment({
				postId: id,
				body: newComment
			}, (err, comment) => {
				if (err) return alert(`Error: ${err}`);
				comment.author = author;
				comments.push(comment);
				this.setState({ lastCommentedId: id, newComment: '', comments });
			});
		}
		e.preventDefault();
		return false;
	}

	componentWillReceiveProps({ id }) {
		let { lastComentedId, comments } = this.state;
		if (id!==lastComentedId && comments && comments.length) {
			this.setState({ lastComentedId:null, comments:[] });
		}
	}

	@bind
	confirmDelete() {
		setTimeout( () => {
			if (confirm('Permanently delete this post?')) this.delete();
		}, 200);
	}

	delete() {
		let { id } = this.props;
		peach.deletePost(id, err => {
			if (err) return alert(`Error: ${err}`);
			this.setState({ deleted: true });
		});
	}

	@bind
	openPostMenu(e) {
		let menu = this.base.querySelector('.mdl-menu');
		if (menu) menu.MaterialMenu.toggle();
		return noBubble(e), false;
	}

	render({ id, comment=true, minimal=false, type, body, message, comments=[], author, authorId, createdTime }, { newComment, comments:stateComments, deleted }) {
		if (deleted===true) return <div class="post post-deleted" />;

		author = author || body && body.authorStream;
		let avatar = author && author.avatarSrc,
			isLiked = this.isLiked(),
			likeCount = this.likeCount(),
			isOwn = (!author && !authorId) || (authorId || author.id)===peach.store.getState().profile.id;

		if (stateComments) {
			let commentIds = comments.map( c => c.id );
			comments = comments.concat(stateComments.filter( c => commentIds.indexOf(c.id)<0 ));
		}
		if (!message || !message[0]) {
			message = body && body.message || body;
		}
		if (!message) message = [];
		if (!Array.isArray(message)) {
			message = [message];
		}
		for (let i=message.length; i--; ) {
			if (typeof message[i]==='string') {
				message[i] = { type:'text', text:message[i] };
			}
			if (!message[i].type) {
				message[i].type = type;
			}
		}

		if (minimal) return (
			<div class={'post type-'+type} minimal={minimal || null} has-avatar={!!author || null} is-own={isOwn || null}>
				{ author ? (
					<div class="avatar" onClick={this.goAuthor} style={`background-image: url(${avatar});`} />
				) : null }
				<div class="post-meta">
					<span class="post-time">{ neatime(createdTime * 1000) }</span>
				</div>
				<div class="items">{
					message.map(renderItem)
				}</div>
			</div>
		);

		return (
			<div class={'post type-'+type} has-avatar={!!author || null} is-own={isOwn || null}>
				<div class="avatar" onClick={this.goAuthor} style={author ? `background-image: url(${avatar});` : null} />

				<div class="post-meta">
					<span class="post-time">{ neatime(createdTime * 1000) }</span>

					{ isOwn ? (
						<span class="post-menu-wrap">
							<Button id={`postmenu-${id}`} class="post-menu" onClick={this.openPostMenu} icon><Icon icon="more vert" /></Button>
							<Menu bottom-right for={`postmenu-${id}`}>
								{/*<Menu.Item onClick={this.share}>Share</Menu.Item>*/}
								<Menu.Item onClick={this.confirmDelete}>Delete</Menu.Item>
							</Menu>
						</span>
					) : null }

					<Button icon class="like-unlike" is-liked={isLiked || null} onClick={this.toggleLike}>
						<Icon icon="favorite" badge={likeCount || null} />
					</Button>
				</div>

				<div class="items">{
					message.map(renderItem)
				}</div>

				{ comment!==false ? (
					<div class="comments" onClick={noBubble} onTouchStart={noBubble} onMouseDown={noBubble}>
						{ comments && comments.length ? (
							comments.map(this.renderInlineComment)
						) : null }
					</div>
				) : null }
				{ comment!==false ? (
					<div class="post-new-comment" onClick={noBubble}>
						<TextField multiline placeholder="Witty remark" value={newComment || ''} onInput={this.linkState('newComment')} onKeyDown={this.maybeComment} />
						<Button icon onClick={this.comment}><Icon icon="send" /></Button>
					</div>
				) : null }
			</div>
		);
	}
}


class ImageViewer extends Component {
	// @bind
	// toggle(e) {
	// 	this.setState({ full: !this.state.full });
	// 	if (e) return e.preventDefault(), e.stopPropagation(), false;
	// }

	render({ src }, { full }) {
		return <img src={src} style={{
			display: 'block',
			maxWidth: full?'auto':'',
			margin: 'auto'
		}} onClick={this.toggle} />;
	}
}


class VideoPlayer extends Component {
	@bind
	play(e) {
		this.setState({ play:true });
		noBubble(e);
	}

	@bind
	stop(e) {
		this.setState({ play:false });
		noBubble(e);
	}

	componentDidUpdate() {
		if (this.state.play) {
			setTimeout(() => this.base.querySelector('video').play(), 100);
		}
	}

	render({ src, posterSrc }, { play }) {
		return (
			<div class="video-player">
				<div class="poster" onClick={this.play}>
					<img src={posterSrc} />
					<Icon icon="play circle outline" />
				</div>
				{ play ? (
					<video src={src} onPause={this.stop} onEnd={this.stop} autoplay autobuffer autostart />
				) : null }
			</div>
		);
	}
}


class MusicPlayer extends Component {
	render({ title, spotifyData={} }) {
		let id = spotifyData && spotifyData.track && spotifyData.track.id,
			url = `https://embed.spotify.com/?uri=spotify:track:${encodeURIComponent(id)}`;
		return (
			<div class="music-player">
				<h6>{ title }</h6>
				{ id ? (
					<iframe src={url} frameborder="0" allowtransparency="true" style="width:100%; height:380px;" />
				) : null }
			</div>
		);
	}
}
