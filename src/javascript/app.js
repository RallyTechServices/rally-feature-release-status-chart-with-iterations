Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    _features: [],
    
    logger: new Rally.technicalservices.logger(),
    items: [
        {xtype:'container',itemId:'selector_box',margin: 5, layout:{type:'hbox'}},
        {xtype:'container',itemId:'chart_box' },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSummary();
    },
    _addSummary: function() {
        var selector_box = this.down('#selector_box');
        selector_box.add({
            xtype:'rallyreleasecombobox',
            itemId:'releasebox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getStoriesInRelease();
                },
                ready: function(rb) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getStoriesInRelease();
                }
            }
        });
    },
    _getStoriesInRelease: function() {
        var me = this;
        this._features = [];
        this._async_flags = {};
        
        var release = this.down('#releasebox').getRecord();
        var release_name = release.get('Name');
        
        var fetch = ['PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'Release.Name',value:release_name}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,stories){
                    Ext.Array.each(stories,function(story){
                        me.logger.log(this,story.get('Name'));
                        
                        if ( story.get('Parent') !== null ) {
                            me.logger.log(this,"Has a parent!");
                            me._async_flags[story.get('ObjectID')] = 1;
                            me._getTopLevelParent(story,story);
                        } else {
                            me._features.push(story);
                        }
                    });
                    this._makeChart();
                }
            }
        });
    },
    // keep track of calls as we spray a bunch of async calls looking for the most top level parent
    _getTopLevelParent: function(story,original_child) {
        var me = this;
        var fetch = ['PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'ObjectID',value:story.get('Parent').ObjectID}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,parents){
                    Ext.Array.each(parents,function(parent){
                        if ( parent.get('Parent') !== null ) {
                            me.logger.log(this,"Has a parent!");
                            if ( story.get('ObjectID') !== original_child.get('ObjectID') ) {
                                delete me._async_flags[story.get('ObjectID')];
                            }
                            me._getTopLevelParent(parent,original_child);
                        } else {
                            delete me._async_flags[original_child.get('ObjectID')];
                            me._features.push(parent);
                        }
                    });
                    me._makeChart();
                }
            }
        });
    },
    _getChartData: function() {
        var me = this;
        this.logger.log(this,"_getSeriesData");
        var chart_data = [];
        
        var data = [];
        var names = [];
        
        Ext.Array.each(me._features,function(feature){
            data.push(1);
            names.push(feature.get('Name'));
        });
        
        var series = [
            {
                type: 'column',
                data: data,
                visible: true,
                name: 'test'
            }
        ];
        return { series: series, categories: names };
    },
    _makeChart: function() {
        this.logger.log(this,"_makeChart");
        this.down('#chart_box').removeAll();
        
        if ( Ext.Object.getKeys(this._async_flags).length > 0 ) {
            this.logger.log(this,"Waiting for ", this._async_flags);
        } else {
            var chart_data = this._getChartData();
            if ( chart_data.categories.length === 0 ) {
                this.down('#chart_box').add({xtype:'container',html:'No Features found for selection.'});
            } else {
                this.down('#chart_box').add({
                    xtype:'rallychart',
                    chartData: {
                        categories: chart_data.categories,
                        series: chart_data.series
                    },
                    chartConfig: {
                        chart: { height: 600 },
                        title: { text: 'Feature Status', align: 'center' },
                        yAxis: [{
                            title: {
                                enabled: true,
                                text: 'Story Points',
                                style: { fontWeight: 'normal' }
                            }
                        }],
                        xAxis: [{
                            title: {
                                enabled: true,
                                text: 'Features'
                            },
                            categories: chart_data.categories,
                            labels: {
                                rotation: 90,
                                align: 'left'
                            }
                        }]
                    }
                });
            }
        }
    }
});